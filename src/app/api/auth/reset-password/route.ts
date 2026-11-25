import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { authService } from "@/server/services/auth.service";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const body = await parseJsonBody(req);
    const result = await authService.resetPassword(body);
    return ok(result, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
