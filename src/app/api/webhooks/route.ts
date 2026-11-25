import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { webhookService } from "@/server/services/webhook.service";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await requireAuthenticatedContext(req);
    const items = await webhookService.listWebhooks(caller.userId!);
    return ok(items, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req);
    const body = await parseJsonBody(req);
    const created = await webhookService.createWebhook(caller.userId!, body);
    return ok(created, 201, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const res = await webhookService.deleteWebhook(caller.userId!, id);
    return ok(res, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
