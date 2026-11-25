import { getRequestId, handleApiError, ok } from "@/lib/api-response";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { analyticsQueryService } from "@/server/services/analytics-query.service";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await requireAuthenticatedContext(req);
    const overview = await analyticsQueryService.getOverview(caller.userId!);
    return ok(overview, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
