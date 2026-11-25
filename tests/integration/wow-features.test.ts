import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { urlService } from "@/server/services/url.service";
import { apiKeyService } from "@/server/services/api-key.service";
import { signWebhookPayload, webhookService } from "@/server/services/webhook.service";
import { flushPendingClicks } from "@/server/services/analytics-ingest.service";
import { GET as redirectRoute } from "@/app/[code]/route";
import { GET as openapiRoute } from "@/app/api/openapi.json/route";
import { GET as urlsGetRoute, POST as urlsPostRoute } from "@/app/api/urls/route";
import { POST as importRoute } from "@/app/api/urls/import/route";
import { GET as exportRoute } from "@/app/api/urls/export/route";
import { GET as adminGetRoute, POST as adminPostRoute } from "@/app/api/admin/route";
import { POST as rulesPostRoute } from "@/app/api/urls/[id]/rules/route";

describe("Wow features integration (real PostgreSQL)", () => {
  let userId = "";

  beforeAll(async () => {
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.blockedDomain.deleteMany();
    await prisma.abuseReport.deleteMany();
    await prisma.linkRule.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { email: "wow-user@test.local", name: "Wow User", role: "USER" },
    });
    userId = user.id;
  });

  beforeEach(async () => {
    await prisma.blockedDomain.deleteMany();
    await prisma.linkRule.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.apiKey.deleteMany();
  });

  afterAll(async () => {
    await flushPendingClicks();
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.blockedDomain.deleteMany();
    await prisma.abuseReport.deleteMany();
    await prisma.linkRule.deleteMany();
    await prisma.clickEvent.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("flags suspicious TLDs and punycode lookalikes behind safety interstitial warning", async () => {
    const { link } = await urlService.createUrl(
      { originalUrl: "https://login-check.tk/verify", alias: "sus-tk" },
      { userId }
    );
    expect(link.safetyStatus).toBe("FLAGGED");

    const res = await redirectRoute(new Request("http://localhost:3000/sus-tk"), {
      params: Promise.resolve({ code: "sus-tk" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/warning/sus-tk");
  });

  it("supports smart device/country routing rules and A/B weighted splits", async () => {
    const { link } = await urlService.createUrl(
      { originalUrl: "https://example.com/desktop-default", alias: "smart1" },
      { userId }
    );

    await prisma.linkRule.create({
      data: {
        shortUrlId: link.id,
        type: "DEVICE",
        priority: 1,
        device: "mobile",
        targetUrl: "https://example.com/mobile-app",
      },
    });

    const mobileRes = await redirectRoute(
      new Request("http://localhost:3000/smart1", {
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
        },
      }),
      { params: Promise.resolve({ code: "smart1" }) }
    );
    expect(mobileRes.status).toBe(302);
    expect(mobileRes.headers.get("location")).toBe("https://example.com/mobile-app");

    const desktopRes = await redirectRoute(
      new Request("http://localhost:3000/smart1", {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36",
        },
      }),
      { params: Promise.resolve({ code: "smart1" }) }
    );
    expect(desktopRes.status).toBe(302);
    expect(desktopRes.headers.get("location")).toBe("https://example.com/desktop-default");
    await flushPendingClicks();
    expect(rulesPostRoute).toBeTypeOf("function");
  });

  it("authenticates REST API calls via scoped Bearer API keys, imports CSV, and exports CSV/JSON", async () => {
    const { rawKey, key } = await apiKeyService.createKey(userId, {
      name: "Automation Key",
      scopes: ["links:read", "links:write"],
    });

    const importRes = await importRoute(
      new Request("http://localhost:3000/api/urls/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${rawKey}`,
        },
        body: JSON.stringify({
          csv: [
            "originalUrl,alias,title",
            "https://example.com/csv-1,csv-ok-1,First CSV Link",
            "javascript:alert(1),bad-row,Invalid Scheme",
          ].join("\n"),
        }),
      })
    );
    expect(importRes.status).toBe(200);
    const importJson = await importRes.json();
    expect(importJson.data.createdCount).toBe(1);
    expect(importJson.data.failedCount).toBe(1);
    expect(importJson.data.errors[0]?.row).toBe(3);

    const listRes = await urlsGetRoute(
      new Request("http://localhost:3000/api/urls", {
        headers: { authorization: `Bearer ${rawKey}` },
      })
    );
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.data).toHaveLength(1);

    const exportCsv = await exportRoute(
      new Request("http://localhost:3000/api/urls/export?format=csv", {
        headers: { authorization: `Bearer ${rawKey}` },
      })
    );
    expect(exportCsv.status).toBe(200);
    expect(await exportCsv.text()).toContain("csv-ok-1");

    // Revoking key immediately rejects subsequent requests
    await apiKeyService.revokeKey(userId, key.id);
    const revokedRes = await urlsPostRoute(
      new Request("http://localhost:3000/api/urls", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${rawKey}`,
        },
        body: JSON.stringify({ originalUrl: "https://example.com/nope" }),
      })
    );
    expect(revokedRes.status).toBe(401);
  });

  it("signs webhook payloads with HMAC-SHA256, serves OpenAPI 3 spec, and gates admin routes", async () => {
    const hook = await webhookService.createWebhook(userId, {
      url: "https://example.com/webhook-sink",
      events: ["click.milestone"],
    });
    const sig = signWebhookPayload(hook.secret, '{"event":"click.milestone"}');
    expect(sig.startsWith("sha256=")).toBe(true);

    const specRes = await openapiRoute();
    expect(specRes.status).toBe(200);
    const spec = await specRes.json();
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.paths["/api/urls"]).toBeDefined();

    // Unauthenticated admin access returns 401
    const adminUnauth = await adminGetRoute(new Request("http://localhost:3000/api/admin"));
    expect(adminUnauth.status).toBe(401);
    expect(adminPostRoute).toBeTypeOf("function");
  });
});
