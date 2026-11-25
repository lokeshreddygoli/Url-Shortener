import Redis from "ioredis";
import { logger } from "@/lib/logger";

const globalForRedis = globalThis as unknown as {
  redisClient: Redis | null | undefined;
  redisUnavailableUntil: number | undefined;
};

const REDIS_BACKOFF_MS = 10_000;

export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  const unavailableUntil = globalForRedis.redisUnavailableUntil ?? 0;
  if (Date.now() < unavailableUntil) {
    return null;
  }

  if (globalForRedis.redisClient) {
    return globalForRedis.redisClient;
  }

  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 500,
    commandTimeout: 500,
    retryStrategy: () => null,
  });

  client.on("error", (err) => {
    globalForRedis.redisUnavailableUntil = Date.now() + REDIS_BACKOFF_MS;
    logger.warn({ err: err.message }, "Redis unavailable, falling back");
  });

  client.on("ready", () => {
    globalForRedis.redisUnavailableUntil = 0;
  });

  globalForRedis.redisClient = client;
  return client;
}

export async function pingRedis(): Promise<{
  configured: boolean;
  connected: boolean;
  latencyMs: number | null;
}> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return { configured: false, connected: false, latencyMs: null };
  }

  const client = getRedisClient();
  if (!client) {
    return { configured: true, connected: false, latencyMs: null };
  }

  const start = performance.now();
  try {
    if (client.status === "wait") {
      await client.connect();
    }
    const pong = await client.ping();
    return {
      configured: true,
      connected: pong === "PONG",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch {
    globalForRedis.redisUnavailableUntil = Date.now() + REDIS_BACKOFF_MS;
    return { configured: true, connected: false, latencyMs: null };
  }
}

export async function closeRedis(): Promise<void> {
  if (globalForRedis.redisClient) {
    try {
      await globalForRedis.redisClient.quit();
    } catch {
      globalForRedis.redisClient.disconnect();
    }
    globalForRedis.redisClient = undefined;
  }
}
