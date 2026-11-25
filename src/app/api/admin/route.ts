import { z } from "zod";
import { AbuseStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { invalidateCachedLink } from "@/lib/cache";
import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { requireAuthenticatedContext } from "@/server/auth/request-context";

const adminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("block_domain"),
    domain: z.string().trim().min(3).max(200),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal("unblock_domain"),
    domain: z.string().trim().min(3).max(200),
  }),
  z.object({
    action: z.literal("disable_link"),
    shortUrlId: z.string().min(1),
  }),
  z.object({
    action: z.literal("toggle_user"),
    userId: z.string().min(1),
    isDisabled: z.boolean(),
  }),
  z.object({
    action: z.literal("resolve_report"),
    reportId: z.string().min(1),
    status: z.enum(["REVIEWED", "DISMISSED", "ACTIONED"]),
  }),
]);

async function requireAdmin(req: Request) {
  const caller = await requireAuthenticatedContext(req);
  if (!caller.isAdmin) {
    throw new AppError(403, "FORBIDDEN", "Administrator privileges required");
  }
  return caller;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin(req);

    const [usersCount, linksCount, clicksCount, reports, blockedDomains, users] =
      await Promise.all([
        prisma.user.count(),
        prisma.shortUrl.count({ where: { deletedAt: null } }),
        prisma.clickEvent.count(),
        prisma.abuseReport.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            shortUrl: {
              select: { id: true, code: true, originalUrl: true, isActive: true },
            },
          },
        }),
        prisma.blockedDomain.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isDisabled: true,
            createdAt: true,
            _count: { select: { shortUrls: true } },
          },
        }),
      ]);

    return ok(
      {
        stats: { usersCount, linksCount, clicksCount },
        reports,
        blockedDomains,
        users,
      },
      200,
      { requestId }
    );
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    await requireAdmin(req);
    const body = adminActionSchema.parse(await parseJsonBody(req));

    if (body.action === "block_domain") {
      const domain = body.domain.toLowerCase();
      const created = await prisma.blockedDomain.upsert({
        where: { domain },
        update: { reason: body.reason ?? null },
        create: { domain, reason: body.reason ?? null },
      });
      return ok(created, 200, { requestId });
    }

    if (body.action === "unblock_domain") {
      await prisma.blockedDomain.deleteMany({
        where: { domain: body.domain.toLowerCase() },
      });
      return ok({ unblocked: true }, 200, { requestId });
    }

    if (body.action === "disable_link") {
      const link = await prisma.shortUrl.update({
        where: { id: body.shortUrlId },
        data: { isActive: false },
      });
      await invalidateCachedLink(link.normalizedCode);
      return ok({ disabled: true }, 200, { requestId });
    }

    if (body.action === "toggle_user") {
      const user = await prisma.user.update({
        where: { id: body.userId },
        data: { isDisabled: body.isDisabled },
        select: { id: true, isDisabled: true },
      });
      return ok(user, 200, { requestId });
    }

    if (body.action === "resolve_report") {
      const report = await prisma.abuseReport.update({
        where: { id: body.reportId },
        data: {
          status: body.status as AbuseStatus,
          resolvedAt: new Date(),
        },
      });
      return ok(report, 200, { requestId });
    }

    return ok({}, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
