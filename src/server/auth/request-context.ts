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
export async function getRequestAuthContext(): Promise<AuthContext> {
  return {
    userId: null,
    isAdmin: false,
    via: "guest",
  };
}
