import { z } from "zod";
import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { AppError } from "@/lib/errors";
import { urlRepository } from "@/server/repositories/url.repository";
import { createGateCookieValue } from "@/server/services/redirect.service";

const proceedSchema = z.object({
  code: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const body = proceedSchema.parse(await parseJsonBody(req));
    const link = await urlRepository.findByNormalizedCode(body.code.toLowerCase());
    if (!link || !link.isActive) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      throw new AppError(410, "EXPIRED_OR_DISABLED", "Link has expired");
    }

    const cookieName = `shortly_warn_${link.id}`;
    const cookieValue = createGateCookieValue(cookieName, link.id, 300_000);
    const res = ok({ allowed: true, redirectTo: `/${link.code}` }, 200, { requestId });
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
