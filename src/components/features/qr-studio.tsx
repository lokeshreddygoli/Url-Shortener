"use client";

import * as React from "react";
import { Download, QrCode } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function QrStudio({
  linkId,
  code,
  shortUrl,
}: {
  linkId: string;
  code: string;
  shortUrl: string;
}) {
  const [fg, setFg] = React.useState("#09090b");
  const [bg, setBg] = React.useState("#ffffff");
  const [ecl, setEcl] = React.useState<"L" | "M" | "Q" | "H">("M");
  const [track, setTrack] = React.useState(true);
  const [previewSrc, setPreviewSrc] = React.useState<string>("");

  const encodedUrl = track ? `${shortUrl}?qr=1` : shortUrl;

  React.useEffect(() => {
    let active = true;
    import("qrcode").then(async (QRCode) => {
      const dataUrl = await QRCode.toDataURL(encodedUrl, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: ecl,
        color: { dark: fg, light: bg },
      });
      if (active) setPreviewSrc(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [encodedUrl, fg, bg, ecl]);

  const buildDownloadUrl = (format: "png" | "svg") => {
    const params = new URLSearchParams({
      format,
      fg,
      bg,
      ecl,
      track: track ? "1" : "0",
      width: "512",
    });
    return `/api/urls/${linkId}/qr?${params.toString()}`;
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-base font-semibold">QR Code Studio</h2>
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Encodes <span className="font-mono">{encodedUrl}</span>
      </p>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800">
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt={`QR code for ${shortUrl}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="h-36 w-36 animate-pulse rounded bg-zinc-100" />
          )}
        </div>

        <div className="w-full flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qr-fg" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Foreground
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="qr-fg"
                  type="color"
                  value={fg}
                  onChange={(e) => setFg(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-zinc-200 bg-transparent"
                />
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {fg}
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="qr-bg" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Background
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="qr-bg"
                  type="color"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-zinc-200 bg-transparent"
                />
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {bg}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="qr-ecl" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Error correction level
            </label>
            <select
              id="qr-ecl"
              value={ecl}
              onChange={(e) => setEcl(e.target.value as "L" | "M" | "Q" | "H")}
              className="mt-1 flex h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="L">L (7% recovery)</option>
              <option value="M">M (15% recovery)</option>
              <option value="Q">Q (25% recovery)</option>
              <option value="H">H (30% recovery)</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={track}
              onChange={(e) => setTrack(e.target.checked)}
            />
            Attribute scans in analytics (?qr=1)
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <a href={buildDownloadUrl("png")} download={`${code}-qr.png`}>
              <Button variant="primary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Download PNG
              </Button>
            </a>
            <a href={buildDownloadUrl("svg")} download={`${code}-qr.svg`}>
              <Button variant="outline" size="sm">
                <Download className="h-3.5 w-3.5" />
                Download SVG
              </Button>
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}
