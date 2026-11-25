import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { urlService } from "@/server/services/url.service";
import { analyticsQueryService } from "@/server/services/analytics-query.service";
import { flushPendingClicks } from "@/server/services/analytics-ingest.service";
import { GET as redirectRoute } from "@/app/[code]/route";
import QRCode from "qrcode";

describe("Analytics aggregation and QR integration (real PostgreSQL)", () => {
  let aliceId = "";
  let bobId = "";

  beforeAll(async () => {
    await prisma.clickEvent.deleteMany();
    await prisma.dailyLinkStats.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();

    const alice = await prisma.user.create({
      data: { email: "alice-analytics@test.local", name: "Alice" },
    });
    const bob = await prisma.user.create({
      data: { email: "bob-analytics@test.local", name: "Bob" },
    });
    aliceId = alice.id;
    bobId = bob.id;
  });

  beforeEach(async () => {
    await prisma.clickEvent.deleteMany();
    await prisma.dailyLinkStats.deleteMany();
    await prisma.shortUrl.deleteMany();
  });

  afterAll(async () => {
    await flushPendingClicks();
    await prisma.clickEvent.deleteMany();
    await prisma.dailyLinkStats.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("computes accurate overview KPIs and per-link analytics with bot/QR/UTM separation", async () => {
    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/analytics-dest", alias: "ana-test" },
      { userId: aliceId }
    );

    // Initially hasData = false
    const emptyStats = await analyticsQueryService.getLinkAnalytics(
      link.id,
      { userId: aliceId },
      "7d"
    );
    expect(emptyStats.hasData).toBe(false);
    expect(emptyStats.summary.totalClicks).toBe(0);

    // Simulate 2 human clicks (1 QR, 1 regular) from distinct IPs + 1 bot click
    await redirectRoute(
      new Request("http://localhost:3000/ana-test?qr=1&utm_source=poster&utm_medium=print", {
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
          "x-forwarded-for": "203.0.113.10",
          "x-vercel-ip-country": "US",
        },
      }),
      { params: Promise.resolve({ code: "ana-test" }) }
    );
    await redirectRoute(
      new Request("http://localhost:3000/ana-test?utm_source=poster&utm_medium=print", {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36",
          "x-forwarded-for": "203.0.113.11",
          "x-vercel-ip-country": "DE",
          referer: "https://news.ycombinator.com/item?id=99",
        },
      }),
      { params: Promise.resolve({ code: "ana-test" }) }
    );
    await redirectRoute(
      new Request("http://localhost:3000/ana-test", {
        headers: {
          "user-agent": "Twitterbot/1.0",
          "x-forwarded-for": "203.0.113.12",
        },
      }),
      { params: Promise.resolve({ code: "ana-test" }) }
    );

    await flushPendingClicks();

    const overview = await analyticsQueryService.getOverview(aliceId);
    expect(overview.stats.totalLinks).toBe(1);
    expect(overview.stats.totalClicks).toBe(3);
    expect(overview.stats.todayClicks).toBe(3);

    const details = await analyticsQueryService.getLinkAnalytics(
      link.id,
      { userId: aliceId },
      "7d"
    );
    expect(details.hasData).toBe(true);
    expect(details.summary).toEqual({
      totalClicks: 3,
      humanClicks: 2,
      botClicks: 1,
      uniqueVisitors: 2,
      qrClicks: 1,
    });
    expect(details.utm[0]?.source).toBe("poster");
    expect(details.utm[0]?.count).toBe(2);
    expect(details.topReferrers.some((r) => r.name === "news.ycombinator.com")).toBe(true);

    // IDOR check: Bob cannot query Alice's analytics
    await expect(
      analyticsQueryService.getLinkAnalytics(link.id, { userId: bobId }, "7d")
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("generates valid PNG and SVG QR codes encoding the short URL", async () => {
    const png = await QRCode.toBuffer("http://localhost:3000/ana-test?qr=1", {
      type: "png",
      width: 256,
    });
    expect(png.subarray(0, 4).toString("hex")).toBe("89504e47"); // PNG magic bytes

    const svg = await QRCode.toString("http://localhost:3000/ana-test?qr=1", {
      type: "svg",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});
