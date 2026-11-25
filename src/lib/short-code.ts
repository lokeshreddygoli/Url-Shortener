import crypto from "node:crypto";

export const BASE62_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const DEFAULT_CODE_LENGTH = 7;

/**
 * Generates a cryptographically random Base62 short code.
 * 7 characters in Base62 = 62^7 ≈ 3.52e12 combinations;
 * even under case-insensitive normalization (36^7 ≈ 7.83e10), collision probability
 * at 10M active links is ~0.013% per insert and handled via bounded DB retries.
 */
export function generateShortCode(length = DEFAULT_CODE_LENGTH): string {
  if (!Number.isInteger(length) || length < 4 || length > 32) {
    throw new RangeError("Short code length must be an integer between 4 and 32");
  }

  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, BASE62_ALPHABET.length);
    out += BASE62_ALPHABET[idx];
  }
  return out;
}
