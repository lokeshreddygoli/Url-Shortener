import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { closeRedis, pingRedis } from "@/lib/redis";
import { getCachedLink, invalidateCachedLink, setCachedLink } from "@/lib/cache";
import {
  flushPendingClicks,
  persistClickBatch,
  recordClickNonBlocking,
} from "@/server/services/analytics-ingest.service";
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
});
