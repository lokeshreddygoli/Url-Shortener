import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { urlService } from "@/server/services/url.service";
import { flushPendingClicks } from "@/server/services/analytics-ingest.service";
import { GET as redirectRoute } from "@/app/[code]/route";

describe("Redirect engine integration (real PostgreSQL)", () => {
  let userId = "";

  beforeAll(async () => {
    await prisma.clickEvent.deleteMany();
    await prisma.dailyLinkStats.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { email: "redirect-user@test.local", name: "Redirect User" },
    });
    userId = user.id;
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

  it("returns 302 with exact Location and no-store, and records human & bot clicks non-blocking", async () => {
    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/target?x=1", alias: "MyAlias" },
      { userId }
    );

    // Case-insensitive lookup + UTM + QR attribution
    const req1 = new Request("http://localhost:3000/myalias?qr=1&utm_source=flyer", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36",
        "x-forwarded-for": "198.51.100.10",
        referer: "https://github.com/shortly",
      },
    });
    const res1 = await redirectRoute(req1, { params: Promise.resolve({ code: "myalias" }) });
    expect(res1.status).toBe(302);
    expect(res1.headers.get("location")).toBe("https://example.com/target?x=1");
    expect(res1.headers.get("cache-control")).toContain("no-store");

    // Bot request
    const req2 = new Request("http://localhost:3000/MyAlias", {
      headers: {
        "user-agent": "Slackbot-LinkExpanding 1.0",
        "x-forwarded-for": "198.51.100.11",
      },
    });
    const res2 = await redirectRoute(req2, { params: Promise.resolve({ code: "MyAlias" }) });
    expect(res2.status).toBe(302);

    await flushPendingClicks();

    const updated = await prisma.shortUrl.findUnique({ where: { id: link.id } });
    expect(updated?.clickCount).toBe(2);

    const events = await prisma.clickEvent.findMany({
      where: { shortUrlId: link.id },
      orderBy: { clickedAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.isBot).toBe(false);
    expect(events[0]?.source).toBe("qr");
    expect(events[0]?.utmSource).toBe("flyer");
    expect(events[0]?.referrerHost).toBe("github.com");
    expect(events[1]?.isBot).toBe(true);
  });

  it("supports 307 and 301 redirect types", async () => {
    await urlService.createUrl(
      { originalUrl: "https://example.com/307", alias: "temp307", redirectType: 307 },
      { userId }
    );
    await urlService.createUrl(
      { originalUrl: "https://example.com/301", alias: "perm301", redirectType: 301 },
      { userId }
    );

    const r307 = await redirectRoute(new Request("http://localhost:3000/temp307"), {
      params: Promise.resolve({ code: "temp307" }),
    });
    expect(r307.status).toBe(307);

    const r301 = await redirectRoute(new Request("http://localhost:3000/perm301"), {
      params: Promise.resolve({ code: "perm301" }),
    });
    expect(r301.status).toBe(301);
    expect(r301.headers.get("cache-control")).toContain("max-age");
    await flushPendingClicks();
  });

  it("returns 404 for unknown/invalid codes and 410 for disabled, expired, or click-limit reached links", async () => {
    const rBad = await redirectRoute(new Request("http://localhost:3000/!!"), {
      params: Promise.resolve({ code: "!!" }),
    });
    expect(rBad.status).toBe(404);

    const rMissing = await redirectRoute(new Request("http://localhost:3000/notfound1"), {
      params: Promise.resolve({ code: "notfound1" }),
    });
    expect(rMissing.status).toBe(404);

    await urlService.createUrl(
      { originalUrl: "https://example.com/disabled", alias: "dis1", isActive: false },
      { userId }
    );
    const rDisabled = await redirectRoute(new Request("http://localhost:3000/dis1"), {
      params: Promise.resolve({ code: "dis1" }),
    });
    expect(rDisabled.status).toBe(410);

    // Expired link
    await prisma.shortUrl.create({
      data: {
        userId,
        originalUrl: "https://example.com/expired",
        code: "exp1",
        normalizedCode: "exp1",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const rExp = await redirectRoute(new Request("http://localhost:3000/exp1"), {
      params: Promise.resolve({ code: "exp1" }),
    });
    expect(rExp.status).toBe(410);

    // Click limit = 1
    await urlService.createUrl(
      { originalUrl: "https://example.com/once", alias: "once1", clickLimit: 1 },
      { userId }
    );
    const first = await redirectRoute(new Request("http://localhost:3000/once1"), {
      params: Promise.resolve({ code: "once1" }),
    });
    expect(first.status).toBe(302);
    await flushPendingClicks();

    const second = await redirectRoute(new Request("http://localhost:3000/once1"), {
      params: Promise.resolve({ code: "once1" }),
    });
    expect(second.status).toBe(410);
  });
});
