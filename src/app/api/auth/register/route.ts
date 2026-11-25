import { fail, getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/request-meta";
import { authService } from "@/server/services/auth.service";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const ip = extractClientIp(req.headers);
    const rl = await checkRateLimit(RATE_LIMITS.AUTH_REGISTER, `ip:${ip}`);
    const rlHeaders = rateLimitHeaders(rl);
    if (!rl.allowed) {
      return fail(429, "RATE_LIMITED", "Too many registration attempts", requestId, undefined, rlHeaders);
    }

    const body = await parseJsonBody(req);
    const result = await authService.register(body);
    return ok(result, 201, { requestId }, rlHeaders);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
