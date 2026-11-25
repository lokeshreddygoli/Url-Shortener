import type { CallerContext } from "@/server/services/url.service";

export interface AuthContext extends CallerContext {
  via: "session" | "api-key" | "guest";
  scopes?: string[];
  apiKeyId?: string;
}

/**
 * Resolves the caller identity for API routes.
 * Wired to Auth.js session in Phase 6 and API keys in Phase 11.
 */
export async function getRequestAuthContext(req?: Request): Promise<AuthContext> {
  const authHeader = req?.headers.get("authorization");
  if (authHeader?.startsWith("Bearer sk_")) {
    // Phase 11 API key verification hook
  }

  return {
    userId: null,
    isAdmin: false,
    via: "guest",
  };
}
