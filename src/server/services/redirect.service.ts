import crypto from "node:crypto";
import {
  CachedLink,
  getCachedLink,
  invalidateCachedLink,
  setCachedLink,
  setNegativeCache,
} from "@/lib/cache";
import { extractRequestMeta } from "@/lib/request-meta";
import { parseUserAgent } from "@/lib/ua";
import {
  ALIAS_REGEX,
  validateAndNormalizeDestinationUrl,
} from "@/lib/validators/url";
import { urlRepository } from "@/server/repositories/url.repository";
import { recordClickNonBlocking } from "@/server/services/analytics-ingest.service";

export type RedirectDecision =
  | { kind: "not_found" }
  | { kind: "gone"; reason: "disabled" | "expired" | "limit_reached" }
  | { kind: "password_required"; code: string; linkId: string }
  | { kind: "safety_warning"; code: string; linkId: string; reason: string | null }
  | {
      kind: "redirect";
      destinationUrl: string;
      status: 301 | 302 | 307;
      cacheControl: string;
    };

function verifyGateCookie(
  cookieHeader: string | null,
  cookieName: string,
  linkId: string
): boolean {
  if (!cookieHeader) return false;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const prefix = `${cookieName}=`;
  const match = cookies.find((c) => c.startsWith(prefix));
  if (!match) return false;

  const token = decodeURIComponent(match.slice(prefix.length));
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const secret = process.env.AUTH_SECRET || "fallback-gate-secret-32chars-minimum";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${cookieName}:${linkId}:${exp}`)
    .digest("base64url");

  const a = Buffer.from(sig ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createGateCookieValue(cookieName: string, linkId: string, ttlMs = 300_000): string {
  const exp = Date.now() + ttlMs;
  const secret = process.env.AUTH_SECRET || "fallback-gate-secret-32chars-minimum";
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${cookieName}:${linkId}:${exp}`)
    .digest("base64url");
  return `${exp}.${sig}`;
}

function selectDestinationWithRules(
  link: CachedLink,
  deviceType: string,
  country: string
): { targetUrl: string; variantId: string | null } {
  const activeRules = (link.rules ?? []).filter((r) => r.isActive);
  if (activeRules.length === 0) {
    return { targetUrl: link.originalUrl, variantId: null };
  }

  // 1. Device rules
  for (const rule of activeRules) {
    if (
      rule.type === "DEVICE" &&
      rule.device &&
      rule.device.toLowerCase() === deviceType.toLowerCase()
    ) {
      return { targetUrl: rule.targetUrl, variantId: rule.id };
    }
  }

  // 2. Country rules
  for (const rule of activeRules) {
    if (
      rule.type === "COUNTRY" &&
      rule.country &&
      rule.country.toUpperCase() === country.toUpperCase()
    ) {
      return { targetUrl: rule.targetUrl, variantId: rule.id };
    }
  }

  // 3. Time-window rules (HH:MM UTC)
  const now = new Date();
  const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(
    now.getUTCMinutes()
  ).padStart(2, "0")}`;
  for (const rule of activeRules) {
    if (rule.type === "TIME_WINDOW" && rule.startTime && rule.endTime) {
      const inWindow =
        rule.startTime <= rule.endTime
          ? hhmm >= rule.startTime && hhmm <= rule.endTime
          : hhmm >= rule.startTime || hhmm <= rule.endTime;
      if (inWindow) {
        return { targetUrl: rule.targetUrl, variantId: rule.id };
      }
    }
  }

  // 4. Weighted A/B split
  const abRules = activeRules.filter((r) => r.type === "AB_SPLIT" && (r.weight ?? 0) > 0);
  if (abRules.length > 0) {
    const totalWeight = abRules.reduce((sum, r) => sum + (r.weight ?? 0), 0);
    if (totalWeight > 0) {
      const pick = crypto.randomInt(0, totalWeight);
      let cumulative = 0;
      for (const rule of abRules) {
        cumulative += rule.weight ?? 0;
        if (pick < cumulative) {
          return { targetUrl: rule.targetUrl, variantId: rule.id };
        }
      }
    }
  }

  return { targetUrl: link.originalUrl, variantId: null };
}

function toCachedLink(record: NonNullable<Awaited<ReturnType<typeof urlRepository.findByNormalizedCode>>>): CachedLink {
  return {
    id: record.id,
    userId: record.userId,
    originalUrl: record.originalUrl,
    code: record.code,
    normalizedCode: record.normalizedCode,
    redirectType: record.redirectType,
    passwordHash: record.passwordHash,
    clickLimit: record.clickLimit,
    clickCount: record.clickCount,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
    isActive: record.isActive,
    safetyStatus: record.safetyStatus,
    safetyReason: record.safetyReason,
    deletedAt: record.deletedAt ? record.deletedAt.toISOString() : null,
    rules: record.rules.map((r) => ({
      id: r.id,
      type: r.type,
      priority: r.priority,
      targetUrl: r.targetUrl,
      device: r.device,
      country: r.country,
      startTime: r.startTime,
      endTime: r.endTime,
      weight: r.weight,
      label: r.label,
      isActive: r.isActive,
    })),
  };
}

export async function resolveRedirect(
  rawCode: string,
  req: Request
): Promise<RedirectDecision> {
  // 1. Cheap format check before touching cache or DB
  if (!ALIAS_REGEX.test(rawCode)) {
    return { kind: "not_found" };
  }

  const normalizedCode = rawCode.toLowerCase();

  // 2. Cache-aside lookup
  let link: CachedLink | null = null;
  const cached = await getCachedLink(normalizedCode);
  if (cached.hit) {
    if (!cached.link) return { kind: "not_found" };
    link = cached.link;
  } else {
    const dbRecord = await urlRepository.findByNormalizedCode(normalizedCode);
    if (!dbRecord) {
      await setNegativeCache(normalizedCode);
      return { kind: "not_found" };
    }
    link = toCachedLink(dbRecord);
    await setCachedLink(link);
  }

  // 3. State checks
  if (!link.isActive || link.deletedAt) {
    return { kind: "gone", reason: "disabled" };
  }
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return { kind: "gone", reason: "expired" };
  }
  if (link.clickLimit !== null && link.clickCount >= link.clickLimit) {
    // Re-check DB if cached entry was near limit to ensure exact enforcement
    const fresh = await urlRepository.findByNormalizedCode(normalizedCode);
    if (!fresh || (fresh.clickLimit !== null && fresh.clickCount >= fresh.clickLimit)) {
      await invalidateCachedLink(normalizedCode);
      return { kind: "gone", reason: "limit_reached" };
    }
    link = toCachedLink(fresh);
  }

  // 4. Safety interstitial gate
  const cookieHeader = req.headers.get("cookie");
  if (
    link.safetyStatus === "FLAGGED" &&
    !verifyGateCookie(cookieHeader, `shortly_warn_${link.id}`, link.id)
  ) {
    return {
      kind: "safety_warning",
      code: link.code,
      linkId: link.id,
      reason: link.safetyReason,
    };
  }

  // 5. Password gate
  if (
    link.passwordHash &&
    !verifyGateCookie(cookieHeader, `shortly_unlock_${link.id}`, link.id)
  ) {
    return {
      kind: "password_required",
      code: link.code,
      linkId: link.id,
    };
  }

  // 6. Parse request metadata & smart routing rules
  const meta = extractRequestMeta(req);
  const ua = parseUserAgent(meta.userAgent);
  const { targetUrl, variantId } = selectDestinationWithRules(
    link,
    ua.deviceType,
    meta.country
  );

  // 7. Re-validate destination URL at redirect time
  const safetyCheck = validateAndNormalizeDestinationUrl(targetUrl);
  if (!safetyCheck.ok) {
    return { kind: "gone", reason: "disabled" };
  }

  // 8. Record click asynchronously (non-blocking)
  recordClickNonBlocking({
    shortUrlId: link.id,
    clickedAt: new Date().toISOString(),
    referrerHost: meta.referrerHost,
    referrerUrl: meta.referrerUrl,
    country: meta.country,
    region: meta.region,
    city: meta.city,
    deviceType: ua.deviceType,
    browser: ua.browser,
    os: ua.os,
    isBot: ua.isBot,
    visitorHash: meta.visitorHash,
    source: meta.source,
    utmSource: meta.utmSource,
    utmMedium: meta.utmMedium,
    utmCampaign: meta.utmCampaign,
    variantId,
  });

  // Invalidate cache if this click could exhaust clickLimit
  if (link.clickLimit !== null && link.clickCount + 1 >= link.clickLimit) {
    void invalidateCachedLink(normalizedCode);
  }

  const status: 301 | 302 | 307 =
    link.redirectType === 301 || link.redirectType === 307
      ? link.redirectType
      : 302;

  const cacheControl =
    status === 301
      ? "public, max-age=86400"
      : "no-store, no-cache, must-revalidate, proxy-revalidate";

  return {
    kind: "redirect",
    destinationUrl: safetyCheck.normalizedUrl,
    status,
    cacheControl,
  };
}
