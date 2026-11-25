import net from "node:net";
import { SafetyStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const SUSPICIOUS_TLDS = new Set(["tk", "ml", "ga", "cf", "gq", "zip", "mov"]);
const KNOWN_BAD_HOSTS = new Set([
  "malware.testing.google.test",
  "testsafebrowsing.appspot.com",
  "phishing.example.test",
]);

export interface SafetyScanResult {
  status: SafetyStatus;
  reason: string | null;
}

export async function scanDestinationSafety(
  normalizedUrl: string
): Promise<SafetyScanResult> {
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return { status: SafetyStatus.FLAGGED, reason: "Malformed destination URL" };
  }

  const host = parsed.hostname.toLowerCase();

  // 1. Admin-blocked domain check
  try {
    const blocked = await prisma.blockedDomain.findUnique({
      where: { domain: host },
    });
    if (blocked) {
      return {
        status: SafetyStatus.FLAGGED,
        reason: blocked.reason || "Domain is on the platform blocklist",
      };
    }
  } catch (err) {
    logger.warn({ err }, "BlockedDomain lookup failed during safety scan");
  }

  // 2. Known-bad list & heuristic checks
  if (KNOWN_BAD_HOSTS.has(host)) {
    return { status: SafetyStatus.FLAGGED, reason: "Matched known unsafe domain" };
  }

  const tld = host.split(".").pop() ?? "";
  if (SUSPICIOUS_TLDS.has(tld)) {
    return {
      status: SafetyStatus.FLAGGED,
      reason: `High-risk TLD (.${tld}) detected`,
    };
  }

  if (host.includes("xn--") && host.split(".").some((p) => p.startsWith("xn--"))) {
    return {
      status: SafetyStatus.FLAGGED,
      reason: "Internationalized punycode domain (possible lookalike)",
    };
  }

  if (net.isIP(host.replace(/^\[|\]$/g, "")) !== 0) {
    return {
      status: SafetyStatus.FLAGGED,
      reason: "Direct public IP address destination flagged for review",
    };
  }

  // 3. Optional Google Safe Browsing v4 check when API key is configured
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim();
  if (apiKey) {
    try {
      const resp = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(2500),
          body: JSON.stringify({
            client: { clientId: "shortly", clientVersion: "1.0.0" },
            threatInfo: {
              threatTypes: [
                "MALWARE",
                "SOCIAL_ENGINEERING",
                "UNWANTED_SOFTWARE",
                "POTENTIALLY_HARMFUL_APPLICATION",
              ],
              platformTypes: ["ANY_PLATFORM"],
              threatEntryTypes: ["URL"],
              threatEntries: [{ url: normalizedUrl }],
            },
          }),
        }
      );
      if (resp.ok) {
        const data = (await resp.json()) as { matches?: Array<{ threatType: string }> };
        if (data.matches && data.matches.length > 0) {
          return {
            status: SafetyStatus.FLAGGED,
            reason: `Google Safe Browsing: ${data.matches[0]?.threatType ?? "THREAT"}`,
          };
        }
      }
    } catch (err) {
      logger.warn({ err }, "Google Safe Browsing check failed, using heuristics");
    }
  }

  return { status: SafetyStatus.SAFE, reason: null };
}
