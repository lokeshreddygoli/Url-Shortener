import bcrypt from "bcryptjs";
import { z } from "zod";
import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import { urlRepository } from "@/server/repositories/url.repository";
import { createGateCookieValue } from "@/server/services/redirect.service";

const unlockSchema = z.object({
  code: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = unlockSchema.parse(await parseJsonBody(req));
    const link = await urlRepository.findByNormalizedCode(body.code.toLowerCase());
    if (!link || !link.isActive) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }

    if (!link.passwordHash) {
      return ok({ unlocked: true, redirectTo: `/${link.code}` }, 200, { requestId });
    }

    const valid = await bcrypt.compare(body.password, link.passwordHash);
    if (!valid) {
      throw new AppError(403, "FORBIDDEN", "Incorrect link password");
    }

    const cookieName = `shortly_unlock_${link.id}`;
    const cookieValue = createGateCookieValue(cookieName, link.id, 300_000);
    const res = ok({ unlocked: true, redirectTo: `/${link.code}` }, 200, { requestId });
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
