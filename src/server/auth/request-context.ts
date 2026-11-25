import { auth } from "@/auth";
import { AppError } from "@/lib/errors";
import type { CallerContext } from "@/server/services/url.service";

export interface AuthContext extends CallerContext {
  via: "session" | "api-key" | "guest";
  scopes?: string[];
  apiKeyId?: string;
}

/**
 * Resolves the caller identity for API routes.
 * Supports Auth.js session cookies and API keys (Phase 11).
 */
export async function getRequestAuthContext(req?: Request): Promise<AuthContext> {
  const authHeader = req?.headers.get("authorization");
  if (authHeader?.startsWith("Bearer sk_")) {
    // Phase 11 API key verification hook
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

export async function requireAuthenticatedContext(req?: Request): Promise<AuthContext> {
  const ctx = await getRequestAuthContext(req);
  if (!ctx.userId) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  }
  return ctx;
}
