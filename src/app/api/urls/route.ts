import { getRequestId, handleApiError, ok, parseJsonBody, fail } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/request-meta";
import { assertApiKeyScope, getRequestAuthContext } from "@/server/auth/request-context";
import { urlService } from "@/server/services/url.service";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await getRequestAuthContext(req);
    assertApiKeyScope(caller, "links:read");
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
    assertApiKeyScope(caller, "links:write");

    const ip = extractClientIp(req.headers);

    // Enforce per-IP rate limit on every creation request
    const ipLimit = caller.userId
      ? { bucket: "url_create_ip_authed", limit: 180, windowSeconds: 60 }
      : RATE_LIMITS.URL_CREATE_GUEST;
    const ipRl = await checkRateLimit(ipLimit, `ip:${ip}`);
    if (!ipRl.allowed) {
      return fail(
        429,
        "RATE_LIMITED",
        "Rate limit exceeded. Please retry later.",
        requestId,
        undefined,
        rateLimitHeaders(ipRl)
      );
    }

    // Additionally enforce per-user or per-API-key rate limit for authenticated callers
    let finalRl = ipRl;
    if (caller.userId) {
      const userConfig = caller.apiKeyId
        ? {
            bucket: "url_create_apikey",
            limit: caller.rateLimitPerMin ?? 120,
            windowSeconds: 60,
          }
        : RATE_LIMITS.URL_CREATE_USER;
      const userKey = caller.apiKeyId
        ? `key:${caller.apiKeyId}`
        : `user:${caller.userId}`;
      const userRl = await checkRateLimit(userConfig, userKey);
      if (!userRl.allowed) {
        return fail(
          429,
          "RATE_LIMITED",
          "Rate limit exceeded. Please retry later.",
          requestId,
          undefined,
          rateLimitHeaders(userRl)
        );
      }
      finalRl = userRl;
    }

    const body = await parseJsonBody(req);
    const result = await urlService.createUrl(body, caller);
    return ok(result, 201, { requestId }, rateLimitHeaders(finalRl));
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
