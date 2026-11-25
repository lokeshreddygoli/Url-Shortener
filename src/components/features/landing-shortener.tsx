"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, QrCode, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

interface CreatedResult {
  id: string;
  code: string;
  shortUrl: string;
  originalUrl: string;
  expiresAt: string | null;
}

export function LandingShortener() {
  const { toast } = useToast();
  const [url, setUrl] = React.useState("");
  const [alias, setAlias] = React.useState("");
  const [expiryDays, setExpiryDays] = React.useState<string>("30");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CreatedResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setQrDataUrl(null);

    try {
      const expiresAt =
        expiryDays !== "never"
          ? new Date(Date.now() + Number(expiryDays) * 86400 * 1000).toISOString()
          : undefined;

      const res = await fetch("/api/urls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalUrl: url.trim(),
          ...(alias.trim() ? { alias: alias.trim() } : {}),
          ...(expiresAt ? { expiresAt } : {}),
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        const msg =
          json?.error?.details?.[0]?.message ||
          json?.error?.message ||
          "Could not shorten that URL";
        setError(msg);
        return;
      }

      const created: CreatedResult = json.data.link;
      setResult(created);
      if (json.data.guestClaimToken) {
        try {
          const existing: string[] = JSON.parse(
            localStorage.getItem("shortly_guest_claims") ?? "[]"
          );
          localStorage.setItem(
            "shortly_guest_claims",
            JSON.stringify([...existing, json.data.guestClaimToken].slice(-20))
          );
        } catch {
          // Ignore storage errors
        }
      }

      toast({
        kind: "success",
        title: "Short link created",
        description: created.shortUrl,
      });

      // Generate client-side QR preview dynamically
      const QRCode = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(`${created.shortUrl}?qr=1`, {
        width: 160,
        margin: 1,
      });
      setQrDataUrl(dataUrl);
    } catch {
      setError("Network error while shortening URL");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.shortUrl);
    setCopied(true);
    toast({ kind: "info", title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card className="mx-auto mt-8 max-w-2xl p-5 sm:p-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/your-long-destination-url"
            aria-label="Destination URL"
            className="h-11 flex-1"
          />
          <Button type="submit" size="lg" disabled={loading} className="sm:w-36">
            <Sparkles className="h-4 w-4" />
            {loading ? "Shortening..." : "Shorten URL"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor="landing-alias" className="sr-only">
              Custom alias (optional)
            </label>
            <Input
              id="landing-alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Custom alias (optional, e.g. launch-26)"
              aria-label="Custom alias"
            />
          </div>
          <div>
            <label htmlFor="landing-expiry" className="sr-only">
              Link expiration
            </label>
            <select
              id="landing-expiry"
              aria-label="Link expiration"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="1">Expires in 24 hours</option>
              <option value="7">Expires in 7 days</option>
              <option value="30">Expires in 30 days (default)</option>
              <option value="90">Expires in 90 days</option>
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-left text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </form>

      {result && (
        <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4 sm:flex-row sm:items-center dark:border-indigo-900/60 dark:bg-indigo-950/30">
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <a
                href={`/${result.code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-base font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
              >
                {result.shortUrl}
              </a>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            </div>
            <p className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
              Destination: {result.originalUrl}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Want to keep &amp; track this link?{" "}
              <Link href="/register" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                Create a free account
              </Link>{" "}
              to claim it automatically.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`QR code for ${result.shortUrl}`}
                className="h-14 w-14 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800"
              />
            )}
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            {qrDataUrl && (
              <a
                href={qrDataUrl}
                download={`${result.code}-qr.png`}
                aria-label="Download QR PNG"
              >
                <Button variant="secondary" size="sm">
                  <QrCode className="h-3.5 w-3.5" />
                  QR
                </Button>
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
