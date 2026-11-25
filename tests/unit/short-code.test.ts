import { describe, expect, it } from "vitest";
import { BASE62_ALPHABET, generateShortCode } from "@/lib/short-code";

describe("short code generator", () => {
  it("generates 7-character Base62 codes by default", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(7);
      for (const ch of code) {
        expect(BASE62_ALPHABET.includes(ch)).toBe(true);
      }
    }
  });

  it("supports custom lengths within bounds and rejects invalid lengths", () => {
    expect(generateShortCode(10)).toHaveLength(10);
    expect(() => generateShortCode(3)).toThrow(RangeError);
    expect(() => generateShortCode(33)).toThrow(RangeError);
  });

  it("produces well-distributed characters across samples", () => {
    const seen = new Set<string>();
    const charCounts = new Map<string, number>();
    for (let i = 0; i < 500; i++) {
      const code = generateShortCode();
      seen.add(code);
      for (const ch of code) {
        charCounts.set(ch, (charCounts.get(ch) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(500);
    // Out of 62 possible characters across 3500 total chars, virtually all should appear
    expect(charCounts.size).toBeGreaterThan(55);
  });
});
