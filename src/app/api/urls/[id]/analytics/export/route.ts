import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getRequestId, handleApiError } from "@/lib/api-response";
import { requireAuthenticatedContext } from "@/server/auth/request-context";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function escapeCsv(val: string | number | boolean | null | undefined): string {
  const s = val === null || val === undefined ? "" : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    const { id } = await params;
    const caller = await requireAuthenticatedContext(req, "analytics:read");
    const link = await prisma.shortUrl.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, code: true },
    });

    if (!link) throw new AppError(404, "NOT_FOUND", "Link not found");
    if (link.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "Access denied");
    }

    const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
    const events = await prisma.clickEvent.findMany({
      where: { shortUrlId: link.id },
      orderBy: { clickedAt: "desc" },
      take: 10_000,
      select: {
        id: true,
        clickedAt: true,
        referrerHost: true,
        country: true,
        deviceType: true,
        browser: true,
        os: true,
        isBot: true,
        source: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
      },
    });

    if (format === "json") {
      return new NextResponse(JSON.stringify(events, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${link.code}-analytics.json"`,
        },
      });
    }

    const header =
      "clickedAt,deviceType,browser,os,country,referrerHost,isBot,source,utmSource,utmMedium,utmCampaign";
    const body = [
      header,
      ...events.map((e) =>
        [
          e.clickedAt.toISOString(),
          e.deviceType,
          e.browser,
          e.os,
          e.country,
          e.referrerHost,
          e.isBot,
          e.source,
          e.utmSource,
          e.utmMedium,
          e.utmCampaign,
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ].join("\n");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${link.code}-analytics.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
