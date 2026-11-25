import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { getRequestAuthContext } from "@/server/auth/request-context";
import { urlService } from "@/server/services/url.service";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await getRequestAuthContext(req);
    const url = new URL(req.url);
    const rawQuery = Object.fromEntries(url.searchParams.entries());
    const result = await urlService.listUrls(rawQuery, caller);
    return ok(result.items, 200, { ...result.meta, requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await getRequestAuthContext(req);
    const body = await parseJsonBody(req);
    const result = await urlService.createUrl(body, caller);
    return ok(result, 201, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
