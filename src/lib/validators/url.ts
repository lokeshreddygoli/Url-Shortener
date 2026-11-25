import net from "node:net";
import { z } from "zod";

export const MAX_URL_LENGTH = 2048;

export const RESERVED_ALIASES = new Set([
  "api",
  "auth",
  "login",
  "register",
  "signup",
  "logout",
  "forgot-password",
  "reset-password",
  "dashboard",
  "analytics",
  "settings",
  "admin",
  "docs",
  "openapi",
  "health",
  "ready",
  "unlock",
  "warning",
  "expired",
  "not-found",
  "_next",
  "static",
  "public",
  "assets",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "urls",
  "keys",
  "webhooks",
  "qr",
  "claim",
]);

export const ALIAS_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }

  const a = parts[0]!;
  const b = parts[1]!;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 IETF protocol
  if (a === 192 && b === 0 && parts[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // Multicast & reserved (224.0.0.0/4+)

  return false;
}

function expandIpv6ToWords(ip: string): number[] | null {
  const zoneIdx = ip.indexOf("%");
  const clean = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;
  const lower = clean.toLowerCase();

  // Handle IPv4-embedded suffix like ::ffff:127.0.0.1
  const lastColon = lower.lastIndexOf(":");
  let normalized = lower;
  if (lastColon >= 0 && lower.slice(lastColon + 1).includes(".")) {
    const ipv4Part = lower.slice(lastColon + 1);
    if (net.isIPv4(ipv4Part) === false) return null;
    const octets = ipv4Part.split(".").map(Number);
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    normalized = `${lower.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];
  const missing = 8 - (left.length + right.length);
  if (halves.length === 1 && left.length !== 8) return null;
  if (halves.length === 2 && missing < 1) return null;

  const full = [
    ...left,
    ...(halves.length === 2 ? Array<string>(missing).fill("0") : []),
    ...right,
  ];
  if (full.length !== 8) return null;

  const words = full.map((part) => parseInt(part, 16));
  if (words.some((w) => Number.isNaN(w) || w < 0 || w > 0xffff)) return null;
  return words;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const words = expandIpv6ToWords(ip);
  if (!words) return true;

  // :: (unspecified) or ::1 (loopback)
  const allZeroPrefix = words.slice(0, 7).every((w) => w === 0);
  if (allZeroPrefix && (words[7] === 0 || words[7] === 1)) {
    return true;
  }

  // IPv4-mapped IPv6 ::ffff:0:0/96 or IPv4-compatible ::0:0/96
  const isV4Mapped =
    words[0] === 0 &&
    words[1] === 0 &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    (words[5] === 0xffff || words[5] === 0);
  if (isV4Mapped) {
    const w6 = words[6]!;
    const w7 = words[7]!;
    const ipv4 = `${(w6 >> 8) & 0xff}.${w6 & 0xff}.${(w7 >> 8) & 0xff}.${w7 & 0xff}`;
    return isPrivateOrReservedIpv4(ipv4);
  }

  // Unique local addresses fc00::/7
  if ((words[0]! & 0xfe00) === 0xfc00) return true;
  // Link-local fe80::/10
  if ((words[0]! & 0xffc0) === 0xfe80) return true;
  // Multicast ff00::/8
  if ((words[0]! & 0xff00) === 0xff00) return true;
  // Documentation 2001:db8::/32
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true;

  return false;
}

export function isDisallowedHost(hostname: string, ownAppUrl?: string): string | null {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return "URL must include a valid host";

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return "Local and internal hostnames are not allowed";
  }

  const ipType = net.isIP(host);
  if (ipType === 4 && isPrivateOrReservedIpv4(host)) {
    return "Private, loopback, or reserved IPv4 targets are not allowed";
  }
  if (ipType === 6 && isPrivateOrReservedIpv6(host)) {
    return "Private, loopback, or reserved IPv6 targets are not allowed";
  }

  if (ownAppUrl) {
    try {
      const appHost = new URL(ownAppUrl).hostname.toLowerCase();
      if (host === appHost) {
        return "Redirecting to this service's own domain is not allowed";
      }
    } catch {
      // Ignore malformed APP_URL fallback
    }
  }

  return null;
}

export type UrlValidationResult =
  | { ok: true; normalizedUrl: string; hostname: string }
  | { ok: false; message: string };

export function validateAndNormalizeDestinationUrl(
  rawInput: string,
  ownAppUrl = process.env.APP_URL
): UrlValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, message: "Destination URL is required" };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      message: `Destination URL must not exceed ${MAX_URL_LENGTH} characters`,
    };
  }
  if (trimmed.startsWith("//")) {
    return { ok: false, message: "Protocol-relative URLs are not allowed" };
  }
  // Reject control characters / whitespace inside URL
  if (/[\x00-\x1f\x7f\s]/.test(trimmed)) {
    return { ok: false, message: "Destination URL contains invalid characters" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      message: "Only http:// and https:// URLs are supported",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "URLs containing embedded credentials are not allowed",
    };
  }

  // Node's URL parser normalizes hostname to lowercase + punycode (ASCII)
  if (!parsed.hostname || !parsed.hostname.includes(".") && net.isIP(parsed.hostname.replace(/^\[|\]$/g, "")) === 0) {
    return {
      ok: false,
      message: "Destination URL must use a valid domain name or public IP",
    };
  }

  const hostError = isDisallowedHost(parsed.hostname, ownAppUrl);
  if (hostError) {
    return { ok: false, message: hostError };
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    hostname: parsed.hostname.toLowerCase(),
  };
}

export function validateCustomAlias(rawAlias: string): {
  ok: true;
  alias: string;
  normalizedCode: string;
} | {
  ok: false;
  message: string;
} {
  const trimmed = rawAlias.trim();
  if (!ALIAS_REGEX.test(trimmed)) {
    return {
      ok: false,
      message:
        "Custom alias must be 3-32 characters using letters, numbers, hyphens, or underscores",
    };
  }

  const normalized = trimmed.toLowerCase();
  if (RESERVED_ALIASES.has(normalized)) {
    return {
      ok: false,
      message: `The alias '${trimmed}' is reserved and cannot be used`,
    };
  }

  return { ok: true, alias: trimmed, normalizedCode: normalized };
}

export const destinationUrlSchema = z
  .string()
  .trim()
  .min(1, "Destination URL is required")
  .max(MAX_URL_LENGTH, `URL cannot exceed ${MAX_URL_LENGTH} characters`)
  .superRefine((val, ctx) => {
    const res = validateAndNormalizeDestinationUrl(val);
    if (!res.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.message,
      });
    }
  })
  .transform((val) => {
    const res = validateAndNormalizeDestinationUrl(val);
    if (!res.ok) return val;
    return res.normalizedUrl;
  });

export const customAliasSchema = z
  .string()
  .trim()
  .superRefine((val, ctx) => {
    const res = validateCustomAlias(val);
    if (!res.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.message,
      });
    }
  });

export const createUrlSchema = z.object({
  originalUrl: destinationUrlSchema,
  alias: customAliasSchema.optional(),
  redirectType: z
    .union([z.literal(302), z.literal(307), z.literal(301)])
    .optional()
    .default(302),
  expiresAt: z.string().datetime().nullable().optional(),
  clickLimit: z.number().int().min(1).max(10_000_000).nullable().optional(),
  password: z.string().min(4).max(128).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  title: z.string().trim().max(200).nullable().optional(),
});

export const updateUrlSchema = z
  .object({
    originalUrl: destinationUrlSchema.optional(),
    alias: customAliasSchema.optional(),
    redirectType: z
      .union([z.literal(302), z.literal(307), z.literal(301)])
      .optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    clickLimit: z.number().int().min(1).max(10_000_000).nullable().optional(),
    password: z.string().min(4).max(128).nullable().optional(),
    clearPassword: z.boolean().optional(),
    isActive: z.boolean().optional(),
    title: z.string().trim().max(200).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const listUrlsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z
    .enum(["all", "active", "expired", "disabled", "password", "has-qr"])
    .optional()
    .default("all"),
  sort: z
    .enum(["createdAt", "clickCount", "expiresAt"])
    .optional()
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const bulkMutateUrlsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["enable", "disable", "delete"]),
});
