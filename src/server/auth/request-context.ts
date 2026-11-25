import { auth } from "@/auth";
import { AppError } from "@/lib/errors";
import { apiKeyService } from "@/server/services/api-key.service";
import type { CallerContext } from "@/server/services/url.service";

export interface AuthContext extends CallerContext {
  via: "session" | "api-key" | "guest";
  scopes?: string[];
  apiKeyId?: string;
  rateLimitPerMin?: number;
}

/**
 * Resolves the caller identity for API routes.
 * Supports Bearer API keys (`sk_live_...`) and Auth.js session cookies.
 */
export async function getRequestAuthContext(req?: Request): Promise<AuthContext> {
  const authHeader = req?.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token.startsWith("sk_")) {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid API key format");
    }
    const verified = await apiKeyService.verifyBearerKey(token);
    if (!verified) {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid or revoked API key");
    }
    return {
      userId: verified.userId,
      isAdmin: verified.isAdmin,
      via: "api-key",
      scopes: verified.scopes,
      apiKeyId: verified.apiKeyId,
      rateLimitPerMin: verified.rateLimitPerMin,
    };
  }

  try {
    const session = await auth();
    if (session?.user?.id) {
      return {
        userId: session.user.id,
        isAdmin: session.user.role === "ADMIN",
        via: "session",
      };
    }
  } catch {
    // Outside Next.js request context (e.g. direct unit/service test invocation)
  }

  return {
    userId: null,
    isAdmin: false,
    via: "guest",
  };
}

export async function requireAuthenticatedContext(
  req?: Request,
  requiredScope?: string
): Promise<AuthContext> {
  const ctx = await getRequestAuthContext(req);
  if (!ctx.userId) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  }
  if (
    requiredScope &&
    ctx.via === "api-key" &&
    !ctx.scopes?.includes(requiredScope)
  ) {
    throw new AppError(
      403,
      "FORBIDDEN",
      `API key lacks required scope '${requiredScope}'`
    );
  }
  return ctx;
}
