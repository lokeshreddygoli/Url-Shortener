import { z } from "zod";
import { getRequestId, handleApiError, ok } from "@/lib/api-response";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import {
  analyticsQueryService,
  type AnalyticsRange,
} from "@/server/services/analytics-query.service";

const rangeSchema = z.enum(["24h", "7d", "30d", "all"]).default("7d");

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    const { id } = await params;
    const caller = await requireAuthenticatedContext(req, "analytics:read");
    const url = new URL(req.url);
    const range: AnalyticsRange = rangeSchema.parse(
      url.searchParams.get("range") ?? "7d"
    );
    const data = await analyticsQueryService.getLinkAnalytics(
      id,
      { userId: caller.userId!, isAdmin: caller.isAdmin },
      range
    );
    return ok(data, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
