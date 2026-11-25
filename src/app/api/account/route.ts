import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { authService } from "@/server/services/auth.service";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await requireAuthenticatedContext(req);
    const profile = await authService.getProfile(caller.userId!);
    return ok(profile, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req);
    const body = await parseJsonBody(req);
    const result = await authService.updateAccount(caller.userId!, body);
    return ok(result, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req);
    const body = await parseJsonBody(req);
    const result = await authService.deleteAccount(caller.userId!, body);
    return ok(result, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
