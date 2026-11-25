import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  rateLimitHeaders,
  resetMemoryRateLimits,
} from "@/lib/rate-limit";

describe("sliding-window rate limiter", () => {
  beforeEach(() => {
    resetMemoryRateLimits();
  });

  it("allows up to limit and returns 429 metadata with Retry-After once exceeded", async () => {
    const cfg = { bucket: `test_${Date.now()}`, limit: 3, windowSeconds: 60 };
    const id = `client_${Date.now()}`;

    const r1 = await checkRateLimit(cfg, id);
    const r2 = await checkRateLimit(cfg, id);
    const r3 = await checkRateLimit(cfg, id);
    const r4 = await checkRateLimit(cfg, id);

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterSeconds).toBeGreaterThan(0);

    const headers = rateLimitHeaders(r4);
    expect(headers["X-RateLimit-Limit"]).toBe("3");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["Retry-After"]).toBeTruthy();
  });
});
