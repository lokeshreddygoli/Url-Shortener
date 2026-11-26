import { fail, getRequestId, handleApiError, ok } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { authService } from "@/server/services/auth.service";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req);
    if (!caller.userId) {
      return fail(401, "UNAUTHORIZED", "Authentication required", requestId);
    }
    const rl = await checkRateLimit(RATE_LIMITS.AUTH_FORGOT, `resend-verify:${caller.userId}`);
    const rlHeaders = rateLimitHeaders(rl);
    if (!rl.allowed) {
      return fail(429, "RATE_LIMITED", "Too many verification emails requested", requestId, undefined, rlHeaders);
    }

    const result = await authService.resendVerification(caller.userId);
    return ok(result, 200, { requestId }, rlHeaders);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
