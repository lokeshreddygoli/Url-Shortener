import { z } from "zod";
import { RuleType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { invalidateCachedLink } from "@/lib/cache";
import { destinationUrlSchema } from "@/lib/validators/url";
import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { urlRepository } from "@/server/repositories/url.repository";

const createRuleSchema = z.object({
  type: z.enum(["DEVICE", "COUNTRY", "TIME_WINDOW", "AB_SPLIT"]),
  priority: z.number().int().min(0).max(1000).default(10),
  targetUrl: destinationUrlSchema,
  device: z.enum(["mobile", "desktop", "tablet"]).optional(),
  country: z.string().trim().length(2).optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  weight: z.number().int().min(1).max(100).optional(),
  label: z.string().trim().max(80).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    const { id } = await params;
    const caller = await requireAuthenticatedContext(req);
    const link = await urlRepository.findById(id);
    if (!link) throw new AppError(404, "NOT_FOUND", "Link not found");
    if (link.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "Access denied");
    }
    return ok(link.rules, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const { id } = await params;
    const caller = await requireAuthenticatedContext(req);
    const link = await urlRepository.findById(id);
    if (!link) throw new AppError(404, "NOT_FOUND", "Link not found");
    if (link.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "Access denied");
    }

    const body = createRuleSchema.parse(await parseJsonBody(req));
    const rule = await prisma.linkRule.create({
      data: {
        shortUrlId: link.id,
        type: body.type as RuleType,
        priority: body.priority,
        targetUrl: body.targetUrl,
        device: body.device ?? null,
        country: body.country?.toUpperCase() ?? null,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        weight: body.weight ?? null,
        label: body.label ?? null,
      },
    });

    await invalidateCachedLink(link.normalizedCode);
    return ok(rule, 201, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const { id } = await params;
    const caller = await requireAuthenticatedContext(req);
    const link = await urlRepository.findById(id);
    if (!link) throw new AppError(404, "NOT_FOUND", "Link not found");
    if (link.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "Access denied");
    }

    const ruleId = new URL(req.url).searchParams.get("ruleId");
    if (!ruleId) {
      throw new AppError(400, "INVALID_INPUT", "ruleId query parameter is required");
    }

    await prisma.linkRule.deleteMany({
      where: { id: ruleId, shortUrlId: link.id },
    });
    await invalidateCachedLink(link.normalizedCode);
    return ok({ deleted: true }, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
