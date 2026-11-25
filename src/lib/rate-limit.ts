import crypto from "node:crypto";
import { getRedisClient } from "@/lib/redis";
import { logger } from "@/lib/logger";

export interface RateLimitConfig {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtUnix: number;
  retryAfterSeconds: number;
}

export const RATE_LIMITS = {
  URL_CREATE_GUEST: { bucket: "url_create_guest", limit: 15, windowSeconds: 60 },
  URL_CREATE_USER: { bucket: "url_create_user", limit: 60, windowSeconds: 60 },
  AUTH_LOGIN: { bucket: "auth_login", limit: 10, windowSeconds: 60 },
  AUTH_REGISTER: { bucket: "auth_register", limit: 6, windowSeconds: 60 },
  AUTH_FORGOT: { bucket: "auth_forgot", limit: 5, windowSeconds: 60 },
  LINK_UNLOCK: { bucket: "link_unlock", limit: 8, windowSeconds: 60 },
  REDIRECT: { bucket: "redirect", limit: 200, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitConfig>;

// In-memory sliding window fallback when Redis is unavailable
const memoryWindows = new Map<string, number[]>();

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number
): RateLimitResult {
  const cutoff = now - windowMs;
  const existing = (memoryWindows.get(key) ?? []).filter((ts) => ts > cutoff);

  if (existing.length >= limit) {
    memoryWindows.set(key, existing);
    const oldest = existing[0] ?? now;
    const resetMs = oldest + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - now) / 1000));
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAtUnix: Math.ceil(resetMs / 1000),
      retryAfterSeconds,
    };
  }

  existing.push(now);
  memoryWindows.set(key, existing);

  // Periodic cleanup to avoid unbounded memory growth
  if (memoryWindows.size > 10_000) {
    for (const [k, timestamps] of memoryWindows.entries()) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) memoryWindows.delete(k);
      else memoryWindows.set(k, fresh);
    }
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.length),
    resetAtUnix: Math.ceil((now + windowMs) / 1000),
    retryAfterSeconds: 0,
  };
}

export async function checkRateLimit(
  config: RateLimitConfig,
  identifier: string
): Promise<RateLimitResult> {
  // Skip rate limiting during k6 benchmark only if explicitly flagged? Never bypass in prod!
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const prefix = process.env.NODE_ENV === "test" ? "shortly:test:" : "shortly:";
  const redisKey = `${prefix}rl:${config.bucket}:${identifier}`;

  const redis = getRedisClient();
  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      const member = `${now}-${crypto.randomUUID()}`;
      const cutoff = now - windowMs;

      const tx = await redis
        .multi()
        .zremrangebyscore(redisKey, "-inf", cutoff)
        .zadd(redisKey, now, member)
        .zcard(redisKey)
        .pexpire(redisKey, windowMs)
        .exec();

      const count = Number(tx?.[2]?.[1] ?? 0);
      if (count > config.limit) {
        // Remove the rejected entry so blocked retries don't extend window unfairly
        await redis.zrem(redisKey, member);
        return {
          allowed: false,
          limit: config.limit,
          remaining: 0,
          resetAtUnix: Math.ceil((now + windowMs) / 1000),
          retryAfterSeconds: config.windowSeconds,
        };
      }

      return {
        allowed: true,
        limit: config.limit,
        remaining: Math.max(0, config.limit - count),
        resetAtUnix: Math.ceil((now + windowMs) / 1000),
        retryAfterSeconds: 0,
      };
    } catch (err) {
      logger.debug({ err }, "Redis rate limit failed, falling back to memory");
    }
  }

  return checkMemoryRateLimit(redisKey, config.limit, windowMs, now);
}

export function rateLimitHeaders(res: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(res.limit),
    "X-RateLimit-Remaining": String(res.remaining),
    "X-RateLimit-Reset": String(res.resetAtUnix),
    ...(res.allowed ? {} : { "Retry-After": String(res.retryAfterSeconds) }),
  };
}

export function resetMemoryRateLimits(): void {
  memoryWindows.clear();
}
