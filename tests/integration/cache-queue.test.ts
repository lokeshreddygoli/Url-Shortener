import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { closeRedis, pingRedis } from "@/lib/redis";
import { getCachedLink, invalidateCachedLink, setCachedLink } from "@/lib/cache";
import {
  CLICK_QUEUE_KEYS,
  drainRedisClickQueue,
  flushPendingClicks,
  persistClickBatch,
  recordClickNonBlocking,
} from "@/server/services/analytics-ingest.service";
import { getRedisClient } from "@/lib/redis";
import { urlService } from "@/server/services/url.service";

describe("Cache, click queue, rollups, and graceful fallback (real PostgreSQL + Redis)", () => {
  let userId = "";

  beforeAll(async () => {
    await prisma.dailyLinkStats.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { email: "queue-test@test.local", name: "Queue Tester" },
    });
    userId = user.id;
  });

  beforeEach(async () => {
    await prisma.dailyLinkStats.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
  });

  afterAll(async () => {
    await flushPendingClicks();
    await closeRedis();
    await prisma.dailyLinkStats.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("caches links in Redis, invalidates on update, and flushes queued clicks without loss", async () => {
    const redisHealth = await pingRedis();
    expect(redisHealth.configured).toBe(true);

    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/queue-target", alias: "qtest1" },
      { userId }
    );

    if (redisHealth.connected) {
      await setCachedLink({
        id: link.id,
        userId,
        originalUrl: link.originalUrl,
        code: link.code,
        normalizedCode: "qtest1",
        redirectType: 302,
        passwordHash: null,
        clickLimit: null,
        clickCount: 0,
        expiresAt: null,
        isActive: true,
        safetyStatus: "SAFE",
        safetyReason: null,
        deletedAt: null,
        rules: [],
      });

      const hit = await getCachedLink("qtest1");
      expect(hit.hit).toBe(true);

      await urlService.updateUrl(
        link.id,
        { originalUrl: "https://example.com/updated-target" },
        { userId }
      );
      const afterInvalidate = await getCachedLink("qtest1");
      expect(afterInvalidate.hit).toBe(false);
    }

    for (let i = 0; i < 10; i++) {
      recordClickNonBlocking({
        shortUrlId: link.id,
        clickedAt: new Date().toISOString(),
        referrerHost: "github.com",
        referrerUrl: null,
        country: "US",
        region: "unknown",
        city: "unknown",
        deviceType: i % 5 === 0 ? "bot" : "desktop",
        browser: "Chrome",
        os: "Windows",
        isBot: i % 5 === 0,
        visitorHash: `visitor-${i}`,
        source: i % 2 === 0 ? "qr" : null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        variantId: null,
      });
    }

    await flushPendingClicks();

    const updated = await prisma.shortUrl.findUnique({ where: { id: link.id } });
    expect(updated?.clickCount).toBe(10);

    const rollups = await prisma.dailyLinkStats.findMany({
      where: { shortUrlId: link.id },
    });
    expect(rollups).toHaveLength(1);
    expect(rollups[0]).toMatchObject({
      totalClicks: 10,
      humanClicks: 8,
      botClicks: 2,
      qrClicks: 5,
    });

    await invalidateCachedLink("qtest1");
  });

  it("degrades gracefully to direct DB insert when Redis is unreachable", async () => {
    const origRedis = process.env.REDIS_URL;
    await closeRedis();
    process.env.REDIS_URL = "redis://127.0.0.1:6399"; // unused port

    try {
      const { link } = await urlService.createUrl(
        { originalUrl: "https://example.com/fallback-target", alias: "fallback1" },
        { userId }
      );

      recordClickNonBlocking({
        shortUrlId: link.id,
        clickedAt: new Date().toISOString(),
        referrerHost: null,
        referrerUrl: null,
        country: "CA",
        region: "unknown",
        city: "unknown",
        deviceType: "desktop",
        browser: "Firefox",
        os: "Linux",
        isBot: false,
        visitorHash: "v-fallback",
        source: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        variantId: null,
      });

      await flushPendingClicks();
      const updated = await prisma.shortUrl.findUnique({ where: { id: link.id } });
      expect(updated?.clickCount).toBe(1);
    } finally {
      await closeRedis();
      process.env.REDIS_URL = origRedis;
    }
  });

  it("batches multiple click events and updates DailyLinkStats rollups atomically", async () => {
    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/batch-target", alias: "batch1" },
      { userId }
    );

    const events = Array.from({ length: 15 }, (_, i) => ({
      shortUrlId: link.id,
      clickedAt: new Date().toISOString(),
      referrerHost: null,
      referrerUrl: null,
      country: "GB",
      region: "unknown",
      city: "unknown",
      deviceType: "mobile",
      browser: "Safari",
      os: "iOS",
      isBot: false,
      visitorHash: `v-${i}`,
      source: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      variantId: null,
    }));

    await persistClickBatch(events);

    const count = await prisma.clickEvent.count({ where: { shortUrlId: link.id } });
    expect(count).toBe(15);
    const rollup = await prisma.dailyLinkStats.findFirst({
      where: { shortUrlId: link.id },
    });
    expect(rollup?.humanClicks).toBe(15);
  });

  it("recovers cleanly from simulated mid-flush crashes (before persist and after commit) with zero lost or double-counted clicks", async () => {
    const redisHealth = await pingRedis();
    if (!redisHealth.connected) return;

    const redis = getRedisClient()!;
    await redis.del(CLICK_QUEUE_KEYS.queue, CLICK_QUEUE_KEYS.processing);

    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/crash-safe", alias: "crash1" },
      { userId }
    );

    // Case A: Crash after atomic move to processing list, BEFORE DB persist
    for (let i = 0; i < 4; i++) {
      await redis.rpush(
        CLICK_QUEUE_KEYS.queue,
        JSON.stringify({
          eventId: `crash-before-${i}-${Date.now()}`,
          shortUrlId: link.id,
          clickedAt: new Date().toISOString(),
          referrerHost: null,
          referrerUrl: null,
          country: "US",
          region: "unknown",
          city: "unknown",
          deviceType: "desktop",
          browser: "Chrome",
          os: "Windows",
          isBot: false,
          visitorHash: `v-before-${i}`,
          source: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          variantId: null,
        })
      );
    }

    await expect(
      drainRedisClickQueue({ simulateCrashBeforeAck: true })
    ).rejects.toThrow(/Simulated worker crash before DB persist/);

    // Items are safely preserved in processing list; DB still has 0
    expect(await redis.llen(CLICK_QUEUE_KEYS.processing)).toBe(4);
    expect((await prisma.shortUrl.findUnique({ where: { id: link.id } }))?.clickCount).toBe(0);

    // Recovery drain inserts all 4 exactly once
    await drainRedisClickQueue();
    expect(await redis.llen(CLICK_QUEUE_KEYS.processing)).toBe(0);
    expect((await prisma.shortUrl.findUnique({ where: { id: link.id } }))?.clickCount).toBe(4);

    // Case B: Crash AFTER DB commit, BEFORE clearing processing list
    for (let i = 0; i < 3; i++) {
      await redis.rpush(
        CLICK_QUEUE_KEYS.queue,
        JSON.stringify({
          eventId: `crash-after-${i}-${Date.now()}`,
          shortUrlId: link.id,
          clickedAt: new Date().toISOString(),
          referrerHost: null,
          referrerUrl: null,
          country: "GB",
          region: "unknown",
          city: "unknown",
          deviceType: "mobile",
          browser: "Safari",
          os: "iOS",
          isBot: false,
          visitorHash: `v-after-${i}`,
          source: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          variantId: null,
        })
      );
    }

    await expect(
      drainRedisClickQueue({ simulateCrashAfterCommit: true })
    ).rejects.toThrow(/Simulated worker crash after DB commit/);

    // DB already committed the 3 new rows (4 + 3 = 7), and processing list still holds them
    expect(await redis.llen(CLICK_QUEUE_KEYS.processing)).toBe(3);
    expect((await prisma.shortUrl.findUnique({ where: { id: link.id } }))?.clickCount).toBe(7);

    // Recovery drain sees conflict on eventId and MUST NOT double-count (remains 7)
    await drainRedisClickQueue();
    expect(await redis.llen(CLICK_QUEUE_KEYS.processing)).toBe(0);
    expect((await prisma.shortUrl.findUnique({ where: { id: link.id } }))?.clickCount).toBe(7);
    expect(await prisma.clickEvent.count({ where: { shortUrlId: link.id } })).toBe(7);
  });
});
