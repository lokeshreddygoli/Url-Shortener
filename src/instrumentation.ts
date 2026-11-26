import { getEnv } from "@/lib/env";

/**
 * Runs once when the Next.js Node.js runtime boots so invalid or missing
 * environment variables fail fast before serving traffic.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    getEnv();
  }
}
