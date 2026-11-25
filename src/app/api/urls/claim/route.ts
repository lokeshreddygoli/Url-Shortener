import { z } from "zod";
import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { urlService } from "@/server/services/url.service";

const claimSchema = z.object({
  token: z.string().min(10).max(1024),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req);
    const body = claimSchema.parse(await parseJsonBody(req));
    const claimed = await urlService.claimGuestLink(body.token, caller.userId!);
    return ok(claimed, 200, { requestId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
