import { z } from "zod";
import { prisma } from "@/lib/db";
import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { requireAuthenticatedContext } from "@/server/auth/request-context";

const presetSchema = z.object({
  name: z.string().trim().min(1).max(60),
  utmSource: z.string().trim().max(100).optional(),
  utmMedium: z.string().trim().max(100).optional(),
  utmCampaign: z.string().trim().max(100).optional(),
  utmTerm: z.string().trim().max(100).optional(),
  utmContent: z.string().trim().max(100).optional(),
});

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await requireAuthenticatedContext(req);
    const presets = await prisma.utmPreset.findMany({
      where: { userId: caller.userId! },
      orderBy: { createdAt: "desc" },
    });
    return ok(presets, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req);
    const body = presetSchema.parse(await parseJsonBody(req));
    const preset = await prisma.utmPreset.create({
      data: {
        userId: caller.userId!,
        name: body.name,
        utmSource: body.utmSource ?? null,
        utmMedium: body.utmMedium ?? null,
        utmCampaign: body.utmCampaign ?? null,
        utmTerm: body.utmTerm ?? null,
        utmContent: body.utmContent ?? null,
      },
    });
    return ok(preset, 201, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    await prisma.utmPreset.deleteMany({
      where: { id, userId: caller.userId! },
    });
    return ok({ deleted: true }, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
