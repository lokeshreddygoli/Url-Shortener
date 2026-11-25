import { getRedisClient } from "@/lib/redis";
import { logger } from "@/lib/logger";

export interface CachedLink {
  id: string;
  userId: string | null;
  originalUrl: string;
  code: string;
  normalizedCode: string;
  redirectType: number;
  passwordHash: string | null;
  clickLimit: number | null;
  clickCount: number;
  expiresAt: string | null;
  isActive: boolean;
  safetyStatus: "SAFE" | "FLAGGED" | "PENDING";
  safetyReason: string | null;
  deletedAt: string | null;
  rules: Array<{
    id: string;
    type: "DEVICE" | "COUNTRY" | "TIME_WINDOW" | "AB_SPLIT";
    priority: number;
    targetUrl: string;
    device: string | null;
    country: string | null;
    startTime: string | null;
    endTime: string | null;
    weight: number | null;
    label: string | null;
    isActive: boolean;
  }>;
}

const LINK_TTL_SECONDS = 60;
const NEG_TTL_SECONDS = 15;

const linkKey = (normalizedCode: string) => `shortly:link:${normalizedCode}`;
const negKey = (normalizedCode: string) => `shortly:neg:${normalizedCode}`;

export async function getCachedLink(
  normalizedCode: string
): Promise<{ hit: true; link: CachedLink | null } | { hit: false }> {
  const redis = getRedisClient();
  if (!redis) return { hit: false };

  try {
    if (redis.status === "wait") await redis.connect();
    const neg = await redis.get(negKey(normalizedCode));
    if (neg === "1") {
      return { hit: true, link: null };
    }
    const raw = await redis.get(linkKey(normalizedCode));
    if (!raw) return { hit: false };
    return { hit: true, link: JSON.parse(raw) as CachedLink };
  } catch (err) {
    logger.debug({ err }, "Redis cache read failed, bypassing");
    return { hit: false };
  }
}

export async function setCachedLink(link: CachedLink): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    if (redis.status === "wait") await redis.connect();
    await redis
      .multi()
      .del(negKey(link.normalizedCode))
      .set(linkKey(link.normalizedCode), JSON.stringify(link), "EX", LINK_TTL_SECONDS)
      .exec();
  } catch (err) {
    logger.debug({ err }, "Redis cache write failed");
  }
}

export async function setNegativeCache(normalizedCode: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    if (redis.status === "wait") await redis.connect();
    await redis.set(negKey(normalizedCode), "1", "EX", NEG_TTL_SECONDS);
  } catch (err) {
    logger.debug({ err }, "Redis negative cache write failed");
  }
}

export async function invalidateCachedLink(normalizedCode: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    if (redis.status === "wait") await redis.connect();
    await redis.del(linkKey(normalizedCode), negKey(normalizedCode));
  } catch (err) {
    logger.debug({ err }, "Redis cache invalidation failed");
  }
}
