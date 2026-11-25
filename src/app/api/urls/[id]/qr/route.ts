import QRCode from "qrcode";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getRequestId, handleApiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { urlRepository } from "@/server/repositories/url.repository";
import { buildShortLinkUrl } from "@/server/services/url.service";

const qrQuerySchema = z.object({
  format: z.enum(["png", "svg"]).default("png"),
  fg: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#09090b"),
  bg: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
  ecl: z.enum(["L", "M", "Q", "H"]).default("M"),
  track: z.enum(["0", "1"]).default("1"),
  width: z.coerce.number().int().min(128).max(1024).default(320),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const requestId = getRequestId(req);
  try {
    const { id } = await params;
    const caller = await requireAuthenticatedContext(req);
    const link = await urlRepository.findById(id);

    if (!link) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }
    if (link.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this link");
    }

    const url = new URL(req.url);
    const query = qrQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    if (!link.hasQr) {
      await urlRepository.updateById(link.id, { hasQr: true });
    }

    const baseShort = buildShortLinkUrl(link.code);
    const target = query.track === "1" ? `${baseShort}?qr=1` : baseShort;

    if (query.format === "svg") {
      const svg = await QRCode.toString(target, {
        type: "svg",
        width: query.width,
        margin: 2,
        errorCorrectionLevel: query.ecl,
        color: {
          dark: query.fg,
          light: query.bg,
        },
      });
      return new NextResponse(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": `inline; filename="${link.code}-qr.svg"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const pngBuffer = await QRCode.toBuffer(target, {
      type: "png",
      width: query.width,
      margin: 2,
      errorCorrectionLevel: query.ecl,
      color: {
        dark: query.fg,
        light: query.bg,
      },
    });

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="${link.code}-qr.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
