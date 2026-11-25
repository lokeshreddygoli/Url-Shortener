import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { fail, getRequestId } from "@/lib/api-response";
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/request-meta";

export const GET = handlers.GET;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/callback/credentials")) {
    const ip = extractClientIp(req.headers);
    const rl = await checkRateLimit(RATE_LIMITS.AUTH_LOGIN, `ip:${ip}`);
    if (!rl.allowed) {
      return fail(
        429,
        "RATE_LIMITED",
        "Too many sign-in attempts. Please wait before trying again.",
        getRequestId(req),
        undefined,
        rateLimitHeaders(rl)
      );
    }
  }
  return handlers.POST(req);
}
