import { getRequestId, handleApiError, ok, parseJsonBody, fail } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/request-meta";
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
    assertSameOriginIfBrowser(req);
    const caller = await getRequestAuthContext(req);
    const ip = extractClientIp(req.headers);

    const rlConfig = caller.userId
      ? RATE_LIMITS.URL_CREATE_USER
      : RATE_LIMITS.URL_CREATE_GUEST;
    const rlKey = caller.apiKeyId
      ? `key:${caller.apiKeyId}`
      : caller.userId
        ? `user:${caller.userId}`
        : `ip:${ip}`;

    const rl = await checkRateLimit(rlConfig, rlKey);
    const rlHeaders = rateLimitHeaders(rl);
    if (!rl.allowed) {
      return fail(
        429,
        "RATE_LIMITED",
        "Rate limit exceeded. Please retry later.",
        requestId,
        undefined,
        rlHeaders
      );
    }

    const body = await parseJsonBody(req);
    const result = await urlService.createUrl(body, caller);
    return ok(result, 201, { requestId }, rlHeaders);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
