import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { cn, formatNumber, formatRelativeDate } from "@/lib/utils";
import { scanDestinationSafety } from "@/server/services/safety-scanner.service";
import { fetchAndCacheLinkPreview } from "@/server/services/preview.service";
import { webhookService } from "@/server/services/webhook.service";
import { authService } from "@/server/services/auth.service";
import { urlService } from "@/server/services/url.service";

describe("Extra service & utility coverage", () => {
  let userId = "";

  beforeAll(async () => {
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.blockedDomain.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();

    const { user } = await authService.register({
      email: "extra-cov@test.local",
      name: "Coverage User",
      password: "Password123!",
    });
    userId = user.id;
  });

  beforeEach(async () => {
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.blockedDomain.deleteMany();
    await prisma.shortUrl.deleteMany();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.blockedDomain.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("formats numbers, classes, and relative dates cleanly", () => {
    expect(cn("p-2", false && "hidden", "text-sm")).toBe("p-2 text-sm");
    expect(formatNumber(12345)).toBe("12,345");
    expect(formatRelativeDate(new Date())).toBe("just now");
    expect(formatRelativeDate(new Date(Date.now() - 120_000))).toBe("2m ago");
    expect(formatRelativeDate(new Date(Date.now() - 7200_000))).toBe("2h ago");
    expect(formatRelativeDate(new Date(Date.now() - 3 * 86400_000))).toBe("3d ago");
    expect(formatRelativeDate(new Date("2020-01-01T00:00:00Z"))).toContain("2020");
  });

  it("scans punycode lookalikes, IP literals, blocked domains, and Safe Browsing API responses", async () => {
    const puny = await scanDestinationSafety("https://xn--bcher-kva.example/login");
    expect(puny.status).toBe("FLAGGED");

    const ipLit = await scanDestinationSafety("https://8.8.8.8/test");
    expect(ipLit.status).toBe("FLAGGED");

    await prisma.blockedDomain.create({
      data: { domain: "blocked.example", reason: "Abuse" },
    });
    const blocked = await scanDestinationSafety("https://blocked.example/path");
    expect(blocked.status).toBe("FLAGGED");

    // Mock Google Safe Browsing API hit
    process.env.GOOGLE_SAFE_BROWSING_API_KEY = "test-gsb-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ matches: [{ threatType: "MALWARE" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const gsb = await scanDestinationSafety("https://clean-looking.example/path");
    expect(gsb.status).toBe("FLAGGED");
    expect(gsb.reason).toContain("MALWARE");
    delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  });

  it("fetches and caches HTML link previews with SSRF redirect blocking", async () => {
    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/article", alias: "prev1" },
      { userId }
    );

    const html = `
      <html>
        <head>
          <title>Shortly Article</title>
          <meta name="description" content="Fast &amp; reliable links" />
          <meta property="og:image" content="/banner.png" />
        </head>
      </html>
    `;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );

    const preview = await fetchAndCacheLinkPreview(link.id, link.originalUrl);
    expect(preview?.title).toBe("Shortly Article");
    expect(preview?.description).toBe("Fast & reliable links");
    expect(preview?.ogImageUrl).toBe("https://example.com/banner.png");

    // Reject SSRF redirect target during preview fetch
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/secret" },
      })
    );
    await expect(
      fetchAndCacheLinkPreview(link.id, link.originalUrl)
    ).rejects.toThrow(/SSRF/);
  });

  it("dispatches signed webhooks with retries and records delivery logs", async () => {
    const hook = await webhookService.createWebhook(userId, {
      url: "https://hooks.example.com/event",
      events: ["click.milestone"],
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await webhookService.dispatchEvent(userId, "click.milestone", {
      code: "prev1",
      milestone: 10,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const deliveries = await webhookService.listDeliveries(userId, hook.id);
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]?.success).toBe(true);
    expect(deliveries[1]?.success).toBe(false);

    await webhookService.deleteWebhook(userId, hook.id);
  });

  it("updates profile and password via authService", async () => {
    const profile = await authService.getProfile(userId);
    expect(profile.email).toBe("extra-cov@test.local");

    await authService.updateAccount(userId, {
      action: "profile",
      name: "Updated Coverage User",
    });
    await authService.updateAccount(userId, {
      action: "password",
      currentPassword: "Password123!",
      newPassword: "NewPassword123!",
    });

    const creds = await authService.verifyCredentials({
      email: "extra-cov@test.local",
      password: "NewPassword123!",
    });
    expect(creds?.name).toBe("Updated Coverage User");
  });
});
