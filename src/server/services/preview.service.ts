import { prisma } from "@/lib/db";
import { validateAndNormalizeDestinationUrl } from "@/lib/validators/url";

const MAX_PREVIEW_BYTES = 262_144; // 256 KB
const PREVIEW_TIMEOUT_MS = 3000;

function extractMeta(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .slice(0, 300);
}

export async function fetchAndCacheLinkPreview(
  shortUrlId: string,
  destinationUrl: string
) {
  let currentUrl = destinationUrl;

  for (let hop = 0; hop < 3; hop++) {
    const check = validateAndNormalizeDestinationUrl(currentUrl);
    if (!check.ok) {
      throw new Error("Unsafe destination URL blocked by SSRF policy");
    }

    const res = await fetch(check.normalizedUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
      headers: {
        "user-agent": "ShortlyPreviewBot/1.0 (+https://shortly.local)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      currentUrl = new URL(location, check.normalizedUrl).toString();
      continue;
    }

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return null;
    }

    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_PREVIEW_BYTES) {
          chunks.push(value.subarray(0, Math.max(0, MAX_PREVIEW_BYTES - (totalBytes - value.byteLength))));
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }

    const html = Buffer.concat(chunks).toString("utf8");
    const title =
      extractMeta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
      extractMeta(html, /<title[^>]*>([^<]+)<\/title>/i);
    const description =
      extractMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
      extractMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const ogImageRaw = extractMeta(
      html,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );

    let ogImageUrl: string | null = null;
    if (ogImageRaw) {
      try {
        const resolved = new URL(ogImageRaw, check.normalizedUrl).toString();
        if (validateAndNormalizeDestinationUrl(resolved).ok) {
          ogImageUrl = resolved;
        }
      } catch {
        ogImageUrl = null;
      }
    }

    const faviconUrl = `${new URL(check.normalizedUrl).origin}/favicon.ico`;

    await prisma.shortUrl.update({
      where: { id: shortUrlId },
      data: {
        title: title ?? undefined,
        description,
        ogImageUrl,
        faviconUrl,
        previewFetchedAt: new Date(),
      },
    });

    return { title, description, ogImageUrl, faviconUrl };
  }

  return null;
}
