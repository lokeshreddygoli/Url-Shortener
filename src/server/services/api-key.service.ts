import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const ALLOWED_SCOPES = ["links:read", "links:write", "analytics:read"] as const;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1).default(["links:read", "links:write"]),
  rateLimitPerMin: z.number().int().min(10).max(5000).default(120),
});

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export const apiKeyService = {
  async createKey(userId: string, rawInput: unknown) {
    const parsed = createApiKeySchema.parse(rawInput);
    const randomPart = crypto.randomBytes(24).toString("base64url");
    const rawKey = `sk_live_${randomPart}`;
    const keyPrefix = rawKey.slice(0, 14);
    const keyHash = hashApiKey(rawKey);

    const created = await prisma.apiKey.create({
      data: {
        userId,
        name: parsed.name,
        keyPrefix,
        keyHash,
        scopes: parsed.scopes,
        rateLimitPerMin: parsed.rateLimitPerMin,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimitPerMin: true,
        createdAt: true,
      },
    });

    return {
      key: {
        ...created,
        createdAt: created.createdAt.toISOString(),
      },
      rawKey, // Shown once at creation
    };
  },

  async listKeys(userId: string) {
    const keys = await prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimitPerMin: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return keys.map((k) => ({
      ...k,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      createdAt: k.createdAt.toISOString(),
    }));
  },

  async revokeKey(userId: string, id: string) {
    const existing = await prisma.apiKey.findFirst({
      where: { id, userId, revokedAt: null },
    });
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "API key not found");
    }
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  },

  async verifyBearerKey(rawKey: string) {
    const keyHash = hashApiKey(rawKey);
    const record = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: { select: { id: true, role: true, isDisabled: true } },
      },
    });

    if (!record || record.revokedAt || record.user.isDisabled) {
      return null;
    }

    // Update lastUsedAt non-blocking
    void prisma.apiKey
      .update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      apiKeyId: record.id,
      userId: record.user.id,
      isAdmin: record.user.role === "ADMIN",
      scopes: record.scopes,
      rateLimitPerMin: record.rateLimitPerMin,
    };
  },
};
