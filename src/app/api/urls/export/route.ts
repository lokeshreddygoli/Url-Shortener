import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestId, handleApiError } from "@/lib/api-response";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { buildShortLinkUrl } from "@/server/services/url.service";

function escapeCsv(val: string | number | boolean | null | undefined): string {
  const s = val === null || val === undefined ? "" : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const caller = await requireAuthenticatedContext(req, "links:read");
    const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";

    const links = await prisma.shortUrl.findMany({
      where: { userId: caller.userId!, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const rows = links.map((l) => ({
      id: l.id,
      code: l.code,
      shortUrl: buildShortLinkUrl(l.code),
      originalUrl: l.originalUrl,
      title: l.title,
      isActive: l.isActive,
      clickCount: l.clickCount,
      clickLimit: l.clickLimit,
      expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    }));

    if (format === "json") {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": 'attachment; filename="shortly-links.json"',
        },
      });
    }

    const header = "code,shortUrl,originalUrl,title,isActive,clickCount,clickLimit,expiresAt,createdAt";
    const body = [
      header,
      ...rows.map((r) =>
        [
          r.code,
          r.shortUrl,
          r.originalUrl,
          r.title,
          r.isActive,
          r.clickCount,
          r.clickLimit,
          r.expiresAt,
          r.createdAt,
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ].join("\n");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="shortly-links.csv"',
      },
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
