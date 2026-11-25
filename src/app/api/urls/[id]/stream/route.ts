import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getRequestId, handleApiError } from "@/lib/api-response";
import { requireAuthenticatedContext } from "@/server/auth/request-context";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    const { id } = await params;
    const caller = await requireAuthenticatedContext(req);
    const link = await prisma.shortUrl.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!link) throw new AppError(404, "NOT_FOUND", "Link not found");
    if (link.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "Access denied");
    }

    const encoder = new TextEncoder();
    let lastTimestamp = new Date(Date.now() - 60_000);
    let closed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        sendEvent("connected", { linkId: id, timestamp: new Date().toISOString() });

        const interval = setInterval(async () => {
          if (closed) return;
          try {
            const [freshClicks, linkMeta] = await Promise.all([
              prisma.clickEvent.findMany({
                where: {
                  shortUrlId: id,
                  clickedAt: { gt: lastTimestamp },
                },
                orderBy: { clickedAt: "asc" },
                take: 20,
                select: {
                  id: true,
                  clickedAt: true,
                  deviceType: true,
                  browser: true,
                  country: true,
                  referrerHost: true,
                  isBot: true,
                  source: true,
                },
              }),
              prisma.shortUrl.findUnique({
                where: { id },
                select: { clickCount: true },
              }),
            ]);

            if (freshClicks.length > 0) {
              const latest = freshClicks[freshClicks.length - 1]!;
              lastTimestamp = latest.clickedAt;
              sendEvent("clicks", {
                totalClicks: linkMeta?.clickCount ?? 0,
                items: freshClicks.map((c) => ({
                  ...c,
                  clickedAt: c.clickedAt.toISOString(),
                })),
              });
            } else {
              sendEvent("heartbeat", { totalClicks: linkMeta?.clickCount ?? 0 });
            }
          } catch {
            // Keep stream resilient
          }
        }, 1500);

        req.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
