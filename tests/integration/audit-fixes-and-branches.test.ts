import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { closeRedis, pingRedis } from "@/lib/redis";
import { checkRateLimit, resetMemoryRateLimits } from "@/lib/rate-limit";
import { authService } from "@/server/services/auth.service";
import { urlService } from "@/server/services/url.service";
import { apiKeyService } from "@/server/services/api-key.service";
import { analyticsQueryService } from "@/server/services/analytics-query.service";
import { fetchAndCacheLinkPreview } from "@/server/services/preview.service";
import { scanDestinationSafety } from "@/server/services/safety-scanner.service";
import { webhookService } from "@/server/services/webhook.service";
import { createGateCookieValue, resolveRedirect } from "@/server/services/redirect.service";
import { flushPendingClicks } from "@/server/services/analytics-ingest.service";
import { GET as urlsGetRoute, POST as urlsPostRoute } from "@/app/api/urls/route";
import { GET as overviewRoute } from "@/app/api/analytics/overview/route";
import { POST as resetRoute } from "@/app/api/auth/reset-password/route";
import { POST as unlockRoute } from "@/app/api/urls/unlock/route";
import { POST as warningProceedRoute } from "@/app/api/urls/warning-proceed/route";

describe("Audit fixes, rate-limiter modes, and service branch coverage", () => {
  let userId = "";

  beforeAll(async () => {
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.linkRule.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany();

    const { user } = await authService.register({
      email: "branch-cov@test.local",
      name: "Branch Tester",
      password: "Password123!",
      claimTokens: ["invalid-claim-token"],
    });
    userId = user.id;
  });

  beforeEach(async () => {
    resetMemoryRateLimits();
    await prisma.linkRule.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await flushPendingClicks();
    await closeRedis();
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.linkRule.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("enforces API key scopes (403 on missing scope) and custom rateLimitPerMin (AUD-02)", async () => {
    const { rawKey: readOnlyKey } = await apiKeyService.createKey(userId, {
      name: "Read-only key",
      scopes: ["links:read"],
      rateLimitPerMin: 10,
    });

    // Allowed on GET /api/urls
    const listRes = await urlsGetRoute(
      new Request("http://localhost:3000/api/urls", {
        headers: { authorization: `Bearer ${readOnlyKey}` },
      })
    );
    expect(listRes.status).toBe(200);

    // Forbidden on POST /api/urls (lacks links:write)
    const createRes = await urlsPostRoute(
      new Request("http://localhost:3000/api/urls", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${readOnlyKey}`,
        },
        body: JSON.stringify({ originalUrl: "https://example.com/blocked" }),
      })
    );
    expect(createRes.status).toBe(403);

    // Forbidden on GET /api/analytics/overview (lacks analytics:read)
    const overviewRes = await overviewRoute(
      new Request("http://localhost:3000/api/analytics/overview", {
        headers: { authorization: `Bearer ${readOnlyKey}` },
      })
    );
    expect(overviewRes.status).toBe(403);

    // Custom rateLimitPerMin = 10 enforced on API key
    const { rawKey: tightKey } = await apiKeyService.createKey(userId, {
      name: "Tight rate key",
      scopes: ["links:write"],
      rateLimitPerMin: 10,
    });
    for (let i = 0; i < 10; i++) {
      const okRes = await urlsPostRoute(
        new Request("http://localhost:3000/api/urls", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${tightKey}`,
            "x-forwarded-for": `198.51.100.${i + 1}`,
          },
          body: JSON.stringify({ originalUrl: `https://example.com/tight-${i}` }),
        })
      );
      expect(okRes.status).toBe(201);
    }
    const rlBlocked = await urlsPostRoute(
      new Request("http://localhost:3000/api/urls", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${tightKey}`,
          "x-forwarded-for": "198.51.100.99",
        },
        body: JSON.stringify({ originalUrl: "https://example.com/tight-over" }),
      })
    );
    expect(rlBlocked.status).toBe(429);
    expect(rlBlocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("tests rate limiter in both Redis shared mode and in-memory fallback per IP and per user (Check 2)", async () => {
    const cfg = { bucket: `chk2_${Date.now()}`, limit: 2, windowSeconds: 60 };
    const redisHealth = await pingRedis();
    expect(redisHealth.connected).toBe(true);

    // 1. Redis shared store per IP
    expect((await checkRateLimit(cfg, "ip:203.0.113.1")).allowed).toBe(true);
    expect((await checkRateLimit(cfg, "ip:203.0.113.1")).allowed).toBe(true);
    expect((await checkRateLimit(cfg, "ip:203.0.113.1")).allowed).toBe(false);
    // Different user key still allowed
    expect((await checkRateLimit(cfg, "user:u-1")).allowed).toBe(true);

    // 2. In-memory fallback when Redis is down (per IP and per user)
    const origRedis = process.env.REDIS_URL;
    await closeRedis();
    process.env.REDIS_URL = "redis://127.0.0.1:6399";
    try {
      const memCfg = { bucket: `mem_${Date.now()}`, limit: 2, windowSeconds: 60 };
      expect((await checkRateLimit(memCfg, "ip:198.51.100.5")).allowed).toBe(true);
      expect((await checkRateLimit(memCfg, "ip:198.51.100.5")).allowed).toBe(true);
      expect((await checkRateLimit(memCfg, "ip:198.51.100.5")).allowed).toBe(false);
      expect((await checkRateLimit(memCfg, "user:u-2")).allowed).toBe(true);
      expect((await checkRateLimit(memCfg, "user:u-2")).allowed).toBe(true);
      expect((await checkRateLimit(memCfg, "user:u-2")).allowed).toBe(false);
    } finally {
      await closeRedis();
      process.env.REDIS_URL = origRedis;
    }
  });

  it("covers redirect rules (COUNTRY, TIME_WINDOW, AB_SPLIT), gate cookies, link.expired webhook, and updateUrl safety rescan", async () => {
    // 1. Create clean link then update to suspicious TLD -> must become FLAGGED (AUD-04)
    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/clean", alias: "rescan1" },
      { userId }
    );
    expect(link.safetyStatus).toBe("SAFE");

    const updated = await urlService.updateUrl(
      link.id,
      {
        originalUrl: "https://evil-check.tk/phish",
        expiresAt: null,
        clickLimit: null,
        password: "Pass1234",
        title: "Updated",
      },
      { userId }
    );
    expect(updated.safetyStatus).toBe("FLAGGED");
    expect(updated.hasPassword).toBe(true);

    // Flagged link redirects to /warning/rescan1
    const warnDecision = await resolveRedirect(
      "rescan1",
      new Request("http://localhost:3000/rescan1")
    );
    expect(warnDecision.kind).toBe("safety_warning");

    // Warning proceed route sets signed cookie
    const warnProceedRes = await warningProceedRoute(
      new Request("http://localhost:3000/api/urls/warning-proceed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "rescan1" }),
      })
    );
    expect(warnProceedRes.status).toBe(200);
    const warnCookie = warnProceedRes.headers.get("set-cookie")?.split(";")[0] ?? "";

    // With warning cookie, password gate triggers next
    const pwDecision = await resolveRedirect(
      "rescan1",
      new Request("http://localhost:3000/rescan1", {
        headers: { cookie: warnCookie },
      })
    );
    expect(pwDecision.kind).toBe("password_required");

    // Unlock route sets signed unlock cookie
    const unlockRes = await unlockRoute(
      new Request("http://localhost:3000/api/urls/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "rescan1", password: "Pass1234" }),
      })
    );
    expect(unlockRes.status).toBe(200);
    const unlockCookie = unlockRes.headers.get("set-cookie")?.split(";")[0] ?? "";

    // With both cookies, redirect succeeds
    const okDecision = await resolveRedirect(
      "rescan1",
      new Request("http://localhost:3000/rescan1", {
        headers: { cookie: `${warnCookie}; ${unlockCookie}` },
      })
    );
    expect(okDecision.kind).toBe("redirect");

    // Clear password + exercise COUNTRY / TIME_WINDOW / AB_SPLIT rules
    await urlService.updateUrl(link.id, { clearPassword: true }, { userId });
    await prisma.linkRule.createMany({
      data: [
        {
          shortUrlId: link.id,
          type: "COUNTRY",
          priority: 1,
          country: "JP",
          targetUrl: "https://example.com/jp",
        },
        {
          shortUrlId: link.id,
          type: "TIME_WINDOW",
          priority: 2,
          startTime: "00:00",
          endTime: "23:59",
          targetUrl: "https://example.com/window",
        },
      ],
    });
    // Force cache refresh
    await urlService.updateUrl(link.id, { isActive: true }, { userId });

    const jpRes = await resolveRedirect(
      "rescan1",
      new Request("http://localhost:3000/rescan1", {
        headers: { cookie: warnCookie, "x-vercel-ip-country": "JP" },
      })
    );
    expect(jpRes).toMatchObject({
      kind: "redirect",
      destinationUrl: "https://example.com/jp",
    });

    const winRes = await resolveRedirect(
      "rescan1",
      new Request("http://localhost:3000/rescan1", {
        headers: { cookie: warnCookie, "x-vercel-ip-country": "US" },
      })
    );
    expect(winRes).toMatchObject({
      kind: "redirect",
      destinationUrl: "https://example.com/window",
    });

    // AB_SPLIT rule test
    await prisma.linkRule.deleteMany({ where: { shortUrlId: link.id } });
    await prisma.linkRule.create({
      data: {
        shortUrlId: link.id,
        type: "AB_SPLIT",
        weight: 100,
        targetUrl: "https://example.com/ab-variant-a",
      },
    });
    await urlService.updateUrl(link.id, { isActive: true }, { userId });
    const abRes = await resolveRedirect(
      "rescan1",
      new Request("http://localhost:3000/rescan1", {
        headers: { cookie: warnCookie },
      })
    );
    expect(abRes).toMatchObject({
      kind: "redirect",
      destinationUrl: "https://example.com/ab-variant-a",
    });

    // Expired link dispatches link.expired webhook
    const hook = await prisma.webhook.create({
      data: {
        userId,
        url: "https://hooks.example.com/expired",
        secret: "whsec_test_1234567890",
        events: ["link.expired"],
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await prisma.shortUrl.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() - 10_000) },
    });
    const expRes = await resolveRedirect(
      "rescan1",
      new Request("http://localhost:3000/rescan1")
    );
    expect(expRes).toEqual({ kind: "gone", reason: "expired" });
    await new Promise((r) => setTimeout(r, 150));
    expect(fetchSpy).toHaveBeenCalled();
    expect(hook.id).toBeTruthy();

    // Also test valid createGateCookieValue tamper check
    expect(createGateCookieValue("test", link.id, 1000)).toContain(".");
  });

  it("covers urlService filters/errors and authService negative branches", async () => {
    // Past expiry on create & update -> 422
    await expect(
      urlService.createUrl(
        { originalUrl: "https://example.com/a", expiresAt: "2020-01-01T00:00:00.000Z" },
        { userId }
      )
    ).rejects.toMatchObject({ statusCode: 422 });

    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/f", alias: "filt1", password: "Pass1234" },
      { userId }
    );
    await expect(
      urlService.updateUrl(
        link.id,
        { expiresAt: "2020-01-01T00:00:00.000Z" },
        { userId }
      )
    ).rejects.toMatchObject({ statusCode: 422 });

    // List all status filters
    for (const status of ["all", "active", "expired", "disabled", "password", "has-qr"] as const) {
      const list = await urlService.listUrls({ status }, { userId });
      expect(Array.isArray(list.items)).toBe(true);
    }

    // 404 branches
    await expect(urlService.getUrl("nonexistent-id", { userId })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      urlService.updateUrl("nonexistent-id", { isActive: false }, { userId })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(urlService.deleteUrl("nonexistent-id", { userId })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(urlService.claimGuestLink("bad.token", userId)).rejects.toMatchObject({
      statusCode: 400,
    });

    // authService negative branches
    expect(await authService.verifyCredentials({ email: "bad", password: "" })).toBeNull();
    expect(
      await authService.verifyCredentials({ email: "nobody@test.local", password: "Password123!" })
    ).toBeNull();
    expect(await authService.requestPasswordReset({ email: "nobody@test.local" })).toEqual({
      sent: true,
    });
    await expect(
      authService.resetPassword({ token: "0".repeat(32), password: "NewPassword123!" })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(authService.getProfile("missing-user")).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      authService.updateAccount(userId, {
        action: "password",
        currentPassword: "WrongPassword!",
        newPassword: "NewPassword123!",
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      authService.deleteAccount(userId, { confirmation: "DELETE" })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      authService.deleteAccount(userId, {
        confirmation: "DELETE",
        currentPassword: "WrongPassword!",
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    // Rate-limited reset-password route returns 429 after burst
    const ip = `198.51.100.${Math.floor(Math.random() * 100) + 120}`;
    for (let i = 0; i < 5; i++) {
      await resetRoute(
        new Request("http://localhost:3000/api/auth/reset-password", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ token: "0".repeat(32), password: "NewPassword123!" }),
        })
      );
    }
    const rlReset = await resetRoute(
      new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ token: "0".repeat(32), password: "NewPassword123!" }),
      })
    );
    expect(rlReset.status).toBe(429);
  });

  it("covers analyticsQueryService ranges, previewService edge cases, safetyScanner fallbacks, and webhook errors", async () => {
    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/ranges", alias: "rng1" },
      { userId }
    );

    // Analytics ranges 24h, 30d, all and 404
    for (const r of ["24h", "30d", "all"] as const) {
      const stats = await analyticsQueryService.getLinkAnalytics(link.id, { userId }, r);
      expect(stats.range).toBe(r);
    }
    await expect(
      analyticsQueryService.getLinkAnalytics("missing-id", { userId }, "7d")
    ).rejects.toMatchObject({ statusCode: 404 });

    // Preview non-200, non-HTML, and og:title/og:description
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not found", { status: 404 })
    );
    expect(await fetchAndCacheLinkPreview(link.id, link.originalUrl)).toBeNull();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("binary", { status: 200, headers: { "content-type": "application/pdf" } })
    );
    expect(await fetchAndCacheLinkPreview(link.id, link.originalUrl)).toBeNull();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        `<html><head><meta property="og:title" content="OG Title" /><meta property="og:description" content="OG Desc" /></head></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      )
    );
    const ogPrev = await fetchAndCacheLinkPreview(link.id, link.originalUrl);
    expect(ogPrev?.title).toBe("OG Title");
    expect(ogPrev?.description).toBe("OG Desc");

    // Safety scanner: malformed, known-bad, and Safe Browsing clean/error fallback
    expect((await scanDestinationSafety("not a url")).status).toBe("FLAGGED");
    expect((await scanDestinationSafety("https://malware.testing.google.test/bad")).status).toBe("FLAGGED");
    process.env.GOOGLE_SAFE_BROWSING_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ matches: [] }), { status: 200 })
    );
    expect((await scanDestinationSafety("https://example.org/safe")).status).toBe("SAFE");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("timeout"));
    expect((await scanDestinationSafety("https://example.org/fallback")).status).toBe("SAFE");
    delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;

    // Webhook list, 404 delete/deliveries, and network error retries
    const hook = await webhookService.createWebhook(userId, {
      url: "https://hooks.example.com/err",
      events: ["click.milestone"],
    });
    expect(await webhookService.listWebhooks(userId)).toHaveLength(1);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await webhookService.dispatchEvent(userId, "click.milestone", { code: "rng1" });
    const logs = await webhookService.listDeliveries(userId, hook.id);
    expect(logs).toHaveLength(3);
    expect(logs[0]?.error).toContain("network down");

    await expect(webhookService.deleteWebhook(userId, "missing")).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(webhookService.listDeliveries(userId, "missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
