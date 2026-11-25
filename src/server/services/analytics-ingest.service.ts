import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis";
import { CLICK_MILESTONES, webhookService } from "@/server/services/webhook.service";

export interface ClickEventPayload {
  shortUrlId: string;
  clickedAt: string;
  referrerHost: string | null;
  referrerUrl: string | null;
  country: string;
  region: string;
  city: string;
  deviceType: string;
  browser: string;
  os: string;
  isBot: boolean;
  visitorHash: string;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  variantId: string | null;
}

const CLICK_QUEUE_KEY =
  process.env.NODE_ENV === "test"
    ? "shortly:test:clicks:queue"
    : "shortly:clicks:queue";
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 1000;

const pendingWrites = new Set<Promise<void>>();
let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;
let shutdownHooksRegistered = false;

function trackPromise(p: Promise<void>) {
  pendingWrites.add(p);
  p.finally(() => pendingWrites.delete(p));
}

export async function persistClickBatch(events: ClickEventPayload[]): Promise<void> {
  if (events.length === 0) return;

  // Filter out events for links that have since been deleted so one deleted link cannot poison a batch
  const candidateIds = Array.from(new Set(events.map((e) => e.shortUrlId)));
  const existingLinks = await prisma.shortUrl.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true },
  });
  const validIdSet = new Set(existingLinks.map((l) => l.id));
  const validEvents = events.filter((e) => validIdSet.has(e.shortUrlId));
  if (validEvents.length === 0) return;

  // Insert click events in a batch
  await prisma.clickEvent.createMany({
    data: validEvents.map((ev) => ({
      shortUrlId: ev.shortUrlId,
      clickedAt: new Date(ev.clickedAt),
      referrerHost: ev.referrerHost,
      referrerUrl: ev.referrerUrl,
      country: ev.country,
      region: ev.region,
      city: ev.city,
      deviceType: ev.deviceType,
      browser: ev.browser,
      os: ev.os,
      isBot: ev.isBot,
      visitorHash: ev.visitorHash,
      source: ev.source,
      utmSource: ev.utmSource,
      utmMedium: ev.utmMedium,
      utmCampaign: ev.utmCampaign,
      variantId: ev.variantId,
    })),
  });

  // Aggregate increments per shortUrlId and per (shortUrlId, day)
  const countsByLink = new Map<string, number>();
  const dailyMap = new Map<
    string,
    { shortUrlId: string; day: Date; total: number; human: number; bot: number; qr: number }
  >();

  for (const ev of validEvents) {
    countsByLink.set(ev.shortUrlId, (countsByLink.get(ev.shortUrlId) ?? 0) + 1);
    const dayStr = ev.clickedAt.slice(0, 10);
    const key = `${ev.shortUrlId}:${dayStr}`;
    const existing = dailyMap.get(key) ?? {
      shortUrlId: ev.shortUrlId,
      day: new Date(`${dayStr}T00:00:00.000Z`),
      total: 0,
      human: 0,
      bot: 0,
      qr: 0,
    };
    existing.total += 1;
    if (ev.isBot) existing.bot += 1;
    else existing.human += 1;
    if (ev.source === "qr") existing.qr += 1;
    dailyMap.set(key, existing);
  }

  const updatedLinks = await Promise.all([
    ...Array.from(countsByLink.entries()).map(([shortUrlId, count]) =>
      prisma.shortUrl.update({
        where: { id: shortUrlId },
        data: { clickCount: { increment: count } },
        select: { id: true, userId: true, code: true, clickCount: true },
      })
    ),
  ]);

  await Promise.all(
    Array.from(dailyMap.values()).map((d) =>
      prisma.dailyLinkStats.upsert({
        where: {
          shortUrlId_day: {
            shortUrlId: d.shortUrlId,
            day: d.day,
          },
        },
        update: {
          totalClicks: { increment: d.total },
          humanClicks: { increment: d.human },
          botClicks: { increment: d.bot },
          qrClicks: { increment: d.qr },
        },
        create: {
          shortUrlId: d.shortUrlId,
          day: d.day,
          totalClicks: d.total,
          humanClicks: d.human,
          botClicks: d.bot,
          qrClicks: d.qr,
        },
      })
    )
  );

  // Fire click.milestone webhooks if a batch crossed a milestone
  for (const link of updatedLinks) {
    if (!link.userId) continue;
    const added = countsByLink.get(link.id) ?? 0;
    const prev = link.clickCount - added;
    for (const milestone of CLICK_MILESTONES) {
      if (prev < milestone && link.clickCount >= milestone) {
        void webhookService.dispatchEvent(link.userId, "click.milestone", {
          shortUrlId: link.id,
          code: link.code,
          milestone,
          clickCount: link.clickCount,
        });
      }
    }
  }
}

export async function drainRedisClickQueue(): Promise<number> {
  if (flushing) return 0;
  const redis = getRedisClient();
  if (!redis) return 0;

  flushing = true;
  let totalFlushed = 0;
  try {
    if (redis.status === "wait") await redis.connect();

    while (true) {
      const txResult = await redis
        .multi()
        .lrange(CLICK_QUEUE_KEY, 0, BATCH_SIZE - 1)
        .ltrim(CLICK_QUEUE_KEY, BATCH_SIZE, -1)
        .exec();

      const items = (txResult?.[0]?.[1] as string[] | undefined) ?? [];
      if (items.length === 0) break;

      const parsed: ClickEventPayload[] = [];
      for (const raw of items) {
        try {
          parsed.push(JSON.parse(raw) as ClickEventPayload);
        } catch {
          logger.warn("Dropped malformed click payload from Redis queue");
        }
      }

      if (parsed.length > 0) {
        try {
          await persistClickBatch(parsed);
          totalFlushed += parsed.length;
        } catch (err) {
          // Push back on transient DB error so no clicks are lost
          await redis.rpush(
            CLICK_QUEUE_KEY,
            ...parsed.map((p) => JSON.stringify(p))
          );
          throw err;
        }
      }

      if (items.length < BATCH_SIZE) break;
    }
  } catch (err) {
    logger.error({ err }, "Failed draining Redis click queue");
  } finally {
    flushing = false;
  }

  return totalFlushed;
}

function ensureWorkerStarted() {
  if (!flushTimer && process.env.NODE_ENV !== "test") {
    flushTimer = setInterval(() => {
      void drainRedisClickQueue();
    }, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }

  if (!shutdownHooksRegistered && typeof process !== "undefined") {
    shutdownHooksRegistered = true;
    const onExit = () => {
      void flushPendingClicks();
    };
    process.once("SIGTERM", onExit);
    process.once("SIGINT", onExit);
  }
}

export function recordClickNonBlocking(payload: ClickEventPayload): void {
  ensureWorkerStarted();

  const task = (async () => {
    const redis = getRedisClient();
    if (redis) {
      try {
        if (redis.status === "wait") await redis.connect();
        const len = await redis.rpush(CLICK_QUEUE_KEY, JSON.stringify(payload));
        if (len >= BATCH_SIZE) {
          await drainRedisClickQueue();
        }
        return;
      } catch (err) {
        logger.warn({ err }, "Redis queue push failed; falling back to direct DB insert");
      }
    }

    try {
      await persistClickBatch([payload]);
    } catch (err) {
      logger.error({ err, shortUrlId: payload.shortUrlId }, "Direct click DB insert failed");
    }
  })();

  trackPromise(task);
}

export async function flushPendingClicks(): Promise<void> {
  if (pendingWrites.size > 0) {
    await Promise.allSettled(Array.from(pendingWrites));
  }
  await drainRedisClickQueue();
}
