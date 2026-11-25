import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis";
import { CLICK_MILESTONES, webhookService } from "@/server/services/webhook.service";

export interface ClickEventPayload {
  eventId?: string;
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

const REDIS_PREFIX = process.env.NODE_ENV === "test" ? "shortly:test:" : "shortly:";
const CLICK_QUEUE_KEY = `${REDIS_PREFIX}clicks:queue`;
const CLICK_PROCESSING_KEY = `${REDIS_PREFIX}clicks:processing`;
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 1000;

/**
 * Atomically moves up to ARGV[1] items from KEYS[1] (queue) to KEYS[2] (processing)
 * inside a single Redis Lua execution (compatible with Redis 3.0 through Redis 7+).
 */
const ATOMIC_MOVE_BATCH_LUA = `
local items = {}
local count = tonumber(ARGV[1])
for i = 1, count do
  local v = redis.call('LPOP', KEYS[1])
  if not v then break end
  redis.call('RPUSH', KEYS[2], v)
  table.insert(items, v)
end
return items
`;

const pendingWrites = new Set<Promise<void>>();
let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;
let shutdownHooksRegistered = false;

function trackPromise(p: Promise<void>) {
  pendingWrites.add(p);
  p.finally(() => pendingWrites.delete(p));
}

export async function persistClickBatch(events: ClickEventPayload[]): Promise<number> {
  if (events.length === 0) return 0;

  const normalizedEvents = events.map((ev) => ({
    ...ev,
    eventId: ev.eventId || crypto.randomUUID(),
  }));

  // Filter out events for links that have since been deleted so one deleted link cannot poison a batch
  const candidateIds = Array.from(new Set(normalizedEvents.map((e) => e.shortUrlId)));
  const existingLinks = await prisma.shortUrl.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true },
  });
  const validIdSet = new Set(existingLinks.map((l) => l.id));
  const validEvents = normalizedEvents.filter((e) => validIdSet.has(e.shortUrlId));
  if (validEvents.length === 0) return 0;

  // Idempotent insert: ON CONFLICT (id) DO NOTHING RETURNING ensures crash recovery
  // after DB commit never double-counts ShortUrl.clickCount or DailyLinkStats.
  const valuesSql = Prisma.join(
    validEvents.map(
      (ev) => Prisma.sql`(
        ${ev.eventId},
        ${ev.shortUrlId},
        ${new Date(ev.clickedAt)},
        ${ev.referrerHost},
        ${ev.referrerUrl},
        ${ev.country},
        ${ev.region},
        ${ev.city},
        ${ev.deviceType},
        ${ev.browser},
        ${ev.os},
        ${ev.isBot},
        ${ev.visitorHash},
        ${ev.source},
        ${ev.utmSource},
        ${ev.utmMedium},
        ${ev.utmCampaign},
        ${ev.variantId}
      )`
    )
  );

  const insertedRows = await prisma.$queryRaw<
    Array<{
      id: string;
      shortUrlId: string;
      clickedAt: Date;
      isBot: boolean;
      source: string | null;
    }>
  >(Prisma.sql`
    INSERT INTO "ClickEvent" (
      "id", "shortUrlId", "clickedAt", "referrerHost", "referrerUrl",
      "country", "region", "city", "deviceType", "browser", "os", "isBot",
      "visitorHash", "source", "utmSource", "utmMedium", "utmCampaign", "variantId"
    )
    VALUES ${valuesSql}
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id", "shortUrlId", "clickedAt", "isBot", "source"
  `);

  if (insertedRows.length === 0) {
    return 0;
  }

  // Aggregate increments ONLY for newly inserted rows
  const countsByLink = new Map<string, number>();
  const dailyMap = new Map<
    string,
    { shortUrlId: string; day: Date; total: number; human: number; bot: number; qr: number }
  >();

  for (const row of insertedRows) {
    countsByLink.set(row.shortUrlId, (countsByLink.get(row.shortUrlId) ?? 0) + 1);
    const dayStr = new Date(row.clickedAt).toISOString().slice(0, 10);
    const key = `${row.shortUrlId}:${dayStr}`;
    const existing = dailyMap.get(key) ?? {
      shortUrlId: row.shortUrlId,
      day: new Date(`${dayStr}T00:00:00.000Z`),
      total: 0,
      human: 0,
      bot: 0,
      qr: 0,
    };
    existing.total += 1;
    if (row.isBot) existing.bot += 1;
    else existing.human += 1;
    if (row.source === "qr") existing.qr += 1;
    dailyMap.set(key, existing);
  }

  const updatedLinks = await Promise.all(
    Array.from(countsByLink.entries()).map(([shortUrlId, count]) =>
      prisma.shortUrl.update({
        where: { id: shortUrlId },
        data: { clickCount: { increment: count } },
        select: { id: true, userId: true, code: true, clickCount: true },
      })
    )
  );

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

  // Fire click.milestone webhooks if this batch crossed a threshold
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

  return insertedRows.length;
}

function parseRawClickPayloads(rawItems: string[]): ClickEventPayload[] {
  const parsed: ClickEventPayload[] = [];
  for (const raw of rawItems) {
    try {
      parsed.push(JSON.parse(raw) as ClickEventPayload);
    } catch {
      logger.warn("Dropped malformed click payload from Redis queue");
    }
  }
  return parsed;
}

export interface DrainOptions {
  /** Test hook to simulate a worker crash mid-flush after moving items to processing */
  simulateCrashBeforeAck?: boolean;
  simulateCrashAfterCommit?: boolean;
}

export async function drainRedisClickQueue(opts: DrainOptions = {}): Promise<number> {
  if (flushing) return 0;
  const redis = getRedisClient();
  if (!redis) return 0;

  flushing = true;
  let totalFlushed = 0;

  try {
    if (redis.status === "wait") await redis.connect();

    // 1. Recover any unacknowledged items from the processing list (crash recovery)
    while (true) {
      const leftover = await redis.lrange(CLICK_PROCESSING_KEY, 0, BATCH_SIZE - 1);
      if (!leftover || leftover.length === 0) break;

      const parsed = parseRawClickPayloads(leftover);
      if (parsed.length > 0) {
        totalFlushed += await persistClickBatch(parsed);
      }
      await redis.ltrim(CLICK_PROCESSING_KEY, leftover.length, -1);
      if (leftover.length < BATCH_SIZE) break;
    }

    // 2. Atomically move batches from queue -> processing, persist idempotently, then ack
    while (true) {
      const moved = (await redis.eval(
        ATOMIC_MOVE_BATCH_LUA,
        2,
        CLICK_QUEUE_KEY,
        CLICK_PROCESSING_KEY,
        String(BATCH_SIZE)
      )) as string[] | null;

      if (!moved || moved.length === 0) break;

      if (opts.simulateCrashBeforeAck) {
        throw new Error("Simulated worker crash before DB persist");
      }

      const parsed = parseRawClickPayloads(moved);
      if (parsed.length > 0) {
        totalFlushed += await persistClickBatch(parsed);
      }

      if (opts.simulateCrashAfterCommit) {
        throw new Error("Simulated worker crash after DB commit before queue ack");
      }

      await redis.ltrim(CLICK_PROCESSING_KEY, moved.length, -1);
      if (moved.length < BATCH_SIZE) break;
    }
  } catch (err) {
    if (!opts.simulateCrashBeforeAck && !opts.simulateCrashAfterCommit) {
      logger.error({ err }, "Failed draining Redis click queue");
    } else {
      throw err;
    }
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
  const withId: ClickEventPayload = {
    ...payload,
    eventId: payload.eventId || crypto.randomUUID(),
  };

  const task = (async () => {
    const redis = getRedisClient();
    if (redis) {
      try {
        if (redis.status === "wait") await redis.connect();
        const len = await redis.rpush(CLICK_QUEUE_KEY, JSON.stringify(withId));
        if (len >= BATCH_SIZE) {
          await drainRedisClickQueue();
        }
        return;
      } catch (err) {
        logger.warn({ err }, "Redis queue push failed; falling back to direct DB insert");
      }
    }

    try {
      await persistClickBatch([withId]);
    } catch (err) {
      logger.error({ err, shortUrlId: withId.shortUrlId }, "Direct click DB insert failed");
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

export const CLICK_QUEUE_KEYS = {
  queue: CLICK_QUEUE_KEY,
  processing: CLICK_PROCESSING_KEY,
};
