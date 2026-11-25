import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { getRequestAuthContext } from "@/server/auth/request-context";
import { urlService } from "@/server/services/url.service";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await getRequestAuthContext(req);
    const body = await parseJsonBody(req);
    const result = await urlService.bulkMutate(body, caller);
    return ok(result, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
