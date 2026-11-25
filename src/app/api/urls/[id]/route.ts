import {
  getRequestId,
  handleApiError,
  noContent,
  ok,
  parseJsonBody,
} from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { getRequestAuthContext } from "@/server/auth/request-context";
import { urlService } from "@/server/services/url.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    const { id } = await params;
    const caller = await getRequestAuthContext(req);
    const link = await urlService.getUrl(id, caller);
    return ok(link, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const { id } = await params;
    const caller = await getRequestAuthContext(req);
    const body = await parseJsonBody(req);
    const updated = await urlService.updateUrl(id, body, caller);
    return ok(updated, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const { id } = await params;
    const caller = await getRequestAuthContext(req);
    await urlService.deleteUrl(id, caller);
    return noContent({ "X-Request-Id": requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
