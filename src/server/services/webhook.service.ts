import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { destinationUrlSchema } from "@/lib/validators/url";

export const WEBHOOK_EVENTS = ["click.milestone", "link.expired"] as const;
export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

export const CLICK_MILESTONES = new Set([10, 50, 100, 500, 1000, 5000, 10000]);

export const createWebhookSchema = z.object({
  url: destinationUrlSchema,
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export function signWebhookPayload(secret: string, body: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function deliverWithRetries(
  webhook: { id: string; url: string; secret: string },
  event: WebhookEventName,
  payload: Record<string, unknown>,
  maxAttempts = 3
) {
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const signature = signWebhookPayload(webhook.secret, body);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let statusCode: number | null = null;
    let errorMsg: string | null = null;
    let success = false;

    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shortly-event": event,
          "x-shortly-signature": signature,
        },
        body,
        signal: AbortSignal.timeout(4000),
      });
      statusCode = res.status;
      success = res.ok;
      if (!res.ok) {
        errorMsg = `HTTP ${res.status}`;
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Delivery request failed";
    }

    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: payload as Prisma.InputJsonValue,
        statusCode,
        attempt,
        success,
        error: errorMsg,
      },
    });

    if (success) return true;

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
  return false;
}

export const webhookService = {
  async createWebhook(userId: string, rawInput: unknown) {
    const parsed = createWebhookSchema.parse(rawInput);
    const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    const webhook = await prisma.webhook.create({
      data: {
        userId,
        url: parsed.url,
        secret,
        events: parsed.events,
      },
    });
    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      secret, // Returned once on creation
      createdAt: webhook.createdAt.toISOString(),
    };
  },

  async listWebhooks(userId: string) {
    const items = await prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { deliveries: true } },
      },
    });
    return items.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      isActive: w.isActive,
      deliveriesCount: w._count.deliveries,
      createdAt: w.createdAt.toISOString(),
    }));
  },

  async deleteWebhook(userId: string, id: string) {
    const res = await prisma.webhook.deleteMany({
      where: { id, userId },
    });
    if (res.count === 0) {
      throw new AppError(404, "NOT_FOUND", "Webhook not found");
    }
    return { deleted: true };
  },

  async listDeliveries(userId: string, webhookId: string) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, userId },
    });
    if (!webhook) {
      throw new AppError(404, "NOT_FOUND", "Webhook not found");
    }
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { deliveredAt: "desc" },
      take: 30,
    });
    return deliveries.map((d) => ({
      ...d,
      deliveredAt: d.deliveredAt.toISOString(),
    }));
  },

  async dispatchEvent(
    userId: string,
    event: WebhookEventName,
    payload: Record<string, unknown>
  ) {
    try {
      const hooks = await prisma.webhook.findMany({
        where: {
          userId,
          isActive: true,
          events: { has: event },
        },
      });
      await Promise.all(
        hooks.map((hook) => deliverWithRetries(hook, event, payload))
      );
    } catch (err) {
      logger.warn({ err, userId, event }, "Webhook dispatch failed");
    }
  },
};
