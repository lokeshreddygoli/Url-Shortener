import bcrypt from "bcryptjs";
import { z } from "zod";
import { fail, getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { AppError } from "@/lib/errors";
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/request-meta";
import { urlRepository } from "@/server/repositories/url.repository";
import { createGateCookieValue } from "@/server/services/redirect.service";

const unlockSchema = z.object({
  code: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const body = unlockSchema.parse(await parseJsonBody(req));
    const ip = extractClientIp(req.headers);
    const rl = await checkRateLimit(
      RATE_LIMITS.LINK_UNLOCK,
      `ip:${ip}:code:${body.code.toLowerCase()}`
    );
    const rlHeaders = rateLimitHeaders(rl);
    if (!rl.allowed) {
      return fail(
        429,
        "RATE_LIMITED",
        "Too many unlock attempts. Please wait before trying again.",
        requestId,
        undefined,
        rlHeaders
      );
    }

    const link = await urlRepository.findByNormalizedCode(body.code.toLowerCase());
    if (!link || !link.isActive) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }

    if (!link.passwordHash) {
      return ok({ unlocked: true, redirectTo: `/${link.code}` }, 200, { requestId }, rlHeaders);
    }

    const valid = await bcrypt.compare(body.password, link.passwordHash);
    if (!valid) {
      throw new AppError(403, "FORBIDDEN", "Incorrect link password");
    }

    const cookieName = `shortly_unlock_${link.id}`;
    const cookieValue = createGateCookieValue(cookieName, link.id, 300_000);
    const res = ok({ unlocked: true, redirectTo: `/${link.code}` }, 200, { requestId }, rlHeaders);
    res.cookies.set(cookieName, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 300,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
