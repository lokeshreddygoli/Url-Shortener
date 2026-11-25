import { z } from "zod";
import { prisma } from "@/lib/db";
import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";

const reportSchema = z.object({
  reportedCode: z.string().trim().min(1).max(64),
  reporterEmail: z.string().trim().email().optional(),
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = reportSchema.parse(await parseJsonBody(req));
    const link = await prisma.shortUrl.findUnique({
      where: { normalizedCode: body.reportedCode.toLowerCase() },
      select: { id: true },
    });

    const report = await prisma.abuseReport.create({
      data: {
        shortUrlId: link?.id ?? null,
        reportedCode: body.reportedCode,
        reporterEmail: body.reporterEmail ?? null,
        reason: body.reason,
        details: body.details ?? null,
      },
      select: { id: true, status: true, createdAt: true },
    });

    return ok(report, 201, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
