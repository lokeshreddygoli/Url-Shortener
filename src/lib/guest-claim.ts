import crypto from "node:crypto";

export interface GuestClaimPayload {
  shortUrlId: string;
  exp: number;
}

function getSecret(): string {
  return (
    process.env.GUEST_CLAIM_SECRET ||
    process.env.AUTH_SECRET ||
    "fallback-dev-guest-claim-secret-32chars"
  );
}

export function createGuestClaimToken(
  shortUrlId: string,
  ttlMs = 7 * 24 * 60 * 60 * 1000
): { token: string; tokenHash: string } {
  const payload: GuestClaimPayload = {
    shortUrlId,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  const token = `${encoded}.${sig}`;
  const tokenHash = hashGuestClaimToken(token);
  return { token, tokenHash };
}

export function hashGuestClaimToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyGuestClaimToken(token: string): GuestClaimPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as GuestClaimPayload;
    if (!parsed.shortUrlId || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
