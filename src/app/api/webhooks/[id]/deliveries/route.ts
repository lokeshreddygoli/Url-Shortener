import { getRequestId, handleApiError, ok } from "@/lib/api-response";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { webhookService } from "@/server/services/webhook.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    const { id } = await params;
    const caller = await requireAuthenticatedContext(req);
    const deliveries = await webhookService.listDeliveries(caller.userId!, id);
    return ok(deliveries, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
