import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { assertApiKeyScope, getRequestAuthContext } from "@/server/auth/request-context";
import { urlService } from "@/server/services/url.service";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await getRequestAuthContext(req);
    assertApiKeyScope(caller, "links:write");
    const body = await parseJsonBody(req);
    const result = await urlService.bulkMutate(body, caller);
    return ok(result, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
