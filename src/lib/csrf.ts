import { AppError } from "@/lib/errors";

/**
 * Verifies same-origin on browser-initiated state-changing requests
 * (when an Origin header is sent and request is not Bearer API-key authenticated).
 */
export function assertSameOriginIfBrowser(req: Request): void {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return;
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    return;
  }

  const reqHost = req.headers.get("host");
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    const originUrl = new URL(origin);
    const appOriginUrl = new URL(appUrl);
    const matchesAppUrl = originUrl.host.toLowerCase() === appOriginUrl.host.toLowerCase();
    const matchesReqHost = reqHost
      ? originUrl.host.toLowerCase() === reqHost.toLowerCase()
      : false;

    if (!matchesAppUrl && !matchesReqHost) {
      throw new AppError(403, "FORBIDDEN", "Cross-origin state-changing request rejected");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(403, "FORBIDDEN", "Invalid request origin");
  }
}
