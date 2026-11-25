import crypto from "node:crypto";

export interface RequestMeta {
  ip: string;
  visitorHash: string;
  userAgent: string;
  referrerHost: string | null;
  referrerUrl: string | null;
  country: string;
  region: string;
  city: string;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  return "0.0.0.0";
}

/**
 * Computes a daily-rotating privacy-preserving visitor hash.
 * Raw IPs are never stored in the database.
 */
export function computeDailyVisitorHash(
  ip: string,
  userAgent: string,
  date: Date = new Date()
): string {
  const secret = process.env.ANALYTICS_HASH_SECRET || process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("ANALYTICS_HASH_SECRET or AUTH_SECRET must be set in production");
  }
  const effectiveSecret = secret || "fallback-analytics-hash-secret-32chars";
  const day = date.toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return crypto
    .createHmac("sha256", `${effectiveSecret}:${day}`)
    .update(`${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

export function parseReferrer(rawReferrer: string | null): {
  referrerHost: string | null;
  referrerUrl: string | null;
} {
  if (!rawReferrer) return { referrerHost: null, referrerUrl: null };
  const trimmed = rawReferrer.trim();
  if (!trimmed) return { referrerHost: null, referrerUrl: null };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { referrerHost: null, referrerUrl: null };
    }
    return {
      referrerHost: parsed.hostname.toLowerCase(),
      referrerUrl: parsed.toString().slice(0, 1024),
    };
  } catch {
    return { referrerHost: null, referrerUrl: null };
  }
}

export function extractRequestMeta(req: Request): RequestMeta {
  const headers = req.headers;
  const url = new URL(req.url);
  const ip = extractClientIp(headers);
  const userAgent = headers.get("user-agent") ?? "";
  const { referrerHost, referrerUrl } = parseReferrer(headers.get("referer"));

  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-geo-country") ||
    "unknown";
  const region =
    headers.get("x-vercel-ip-country-region") ||
    headers.get("x-geo-region") ||
    "unknown";
  const city =
    headers.get("x-vercel-ip-city") ||
    headers.get("x-geo-city") ||
    "unknown";

  const qrFlag = url.searchParams.get("qr");
  const source = qrFlag === "1" || qrFlag === "true" ? "qr" : null;

  return {
    ip,
    visitorHash: computeDailyVisitorHash(ip, userAgent),
    userAgent,
    referrerHost,
    referrerUrl,
    country: country.slice(0, 64),
    region: region.slice(0, 64),
    city: city.slice(0, 64),
    source,
    utmSource: url.searchParams.get("utm_source")?.slice(0, 128) ?? null,
    utmMedium: url.searchParams.get("utm_medium")?.slice(0, 128) ?? null,
    utmCampaign: url.searchParams.get("utm_campaign")?.slice(0, 128) ?? null,
  };
}
