import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { closeRedis, getRedisClient } from "@/lib/redis";
import { resetMemoryRateLimits } from "@/lib/rate-limit";
import { urlService } from "@/server/services/url.service";
import { POST as postUrlsRoute } from "@/app/api/urls/route";
import { POST as unlockRoute } from "@/app/api/urls/unlock/route";
import { handleApiError } from "@/lib/api-response";

describe("Security hardening integration (rate limits, headers, error safety)", () => {
  let userId = "";

  beforeAll(async () => {
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
    const user = await prisma.user.create({
      data: { email: "sec-test@test.local", name: "Sec Tester" },
    });
    userId = user.id;
  });

  beforeEach(async () => {
    resetMemoryRateLimits();
    const redis = getRedisClient();
    if (redis) {
      try {
        if (redis.status === "wait") await redis.connect();
        const keys = await redis.keys("shortly:test:rl:*");
        if (keys.length > 0) await redis.del(...keys);
      } catch {
        // Ignore if redis offline
      }
    }
    await prisma.shortUrl.deleteMany();
  });

  afterAll(async () => {
    await closeRedis();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("enforces guest creation rate limit with real 429 + Retry-After + X-RateLimit headers", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
    let lastRes: Response | null = null;

    for (let i = 0; i < 16; i++) {
      lastRes = await postUrlsRoute(
        new Request("http://localhost:3000/api/urls", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({
            originalUrl: `https://example.com/rl-${i}`,
          }),
        })
      );
      if (i < 15) {
        expect(lastRes.status).toBe(201);
        expect(lastRes.headers.get("X-RateLimit-Limit")).toBe("15");
      }
    }

    expect(lastRes?.status).toBe(429);
    expect(lastRes?.headers.get("Retry-After")).toBeTruthy();
    const body = await lastRes?.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("enforces brute-force rate limit on password unlock endpoint", async () => {
    await urlService.createUrl(
      {
        originalUrl: "https://example.com/locked",
        alias: "locked1",
        password: "CorrectPassword99",
      },
      { userId }
    );

    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
    for (let i = 0; i < 8; i++) {
      const res = await unlockRoute(
        new Request("http://localhost:3000/api/urls/unlock", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({ code: "locked1", password: "wrong" }),
        })
      );
      expect(res.status).toBe(403);
    }

    const blocked = await unlockRoute(
      new Request("http://localhost:3000/api/urls/unlock", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ code: "locked1", password: "CorrectPassword99" }),
      })
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("never leaks stack traces or internal SQL details on unexpected 500 errors", async () => {
    const res = handleApiError(
      new Error("SELECT * FROM secret_table WHERE token = 'secret'"),
      "req-test-500"
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(json.error.message).toBe("An unexpected error occurred");
    expect(JSON.stringify(json)).not.toContain("secret_table");
    expect(json.meta.requestId).toBe("req-test-500");
  });
});
