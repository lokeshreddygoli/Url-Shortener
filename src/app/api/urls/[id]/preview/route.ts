import { getRequestId, handleApiError, ok } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { urlRepository } from "@/server/repositories/url.repository";
import { fetchAndCacheLinkPreview } from "@/server/services/preview.service";

interface RouteParams {
  params: Promise<{ id: string }>;
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

    const preview = await fetchAndCacheLinkPreview(link.id, link.originalUrl);
    return ok({ preview }, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
