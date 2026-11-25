import { describe, expect, it } from "vitest";
import { parseUserAgent } from "@/lib/ua";
import { computeDailyVisitorHash, parseReferrer } from "@/lib/request-meta";

describe("User-Agent and bot parser", () => {
  it("parses desktop Chrome on Windows", () => {
    const res = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    );
    expect(res).toEqual({
      deviceType: "desktop",
      browser: "Chrome",
      os: "Windows",
      isBot: false,
    });
  });

  it("parses mobile Safari on iOS", () => {
    const res = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
    );
    expect(res).toEqual({
      deviceType: "mobile",
      browser: "Safari",
      os: "iOS",
      isBot: false,
    });
  });

  it("identifies bots and link-preview crawlers separately", () => {
    expect(parseUserAgent("Slackbot-LinkExpanding 1.0").isBot).toBe(true);
    expect(parseUserAgent("Twitterbot/1.0").isBot).toBe(true);
    expect(parseUserAgent("curl/8.7.1").isBot).toBe(true);
    expect(parseUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)").deviceType).toBe("bot");
  });
});

describe("privacy-first request meta", () => {
  it("produces deterministic visitor hashes within the same UTC day and rotates across days", () => {
    const day1 = new Date("2026-11-25T10:00:00Z");
    const day1Later = new Date("2026-11-25T23:59:00Z");
    const day2 = new Date("2026-11-26T00:01:00Z");

    const h1 = computeDailyVisitorHash("203.0.113.5", "Chrome", day1);
    const h1Later = computeDailyVisitorHash("203.0.113.5", "Chrome", day1Later);
    const h2 = computeDailyVisitorHash("203.0.113.5", "Chrome", day2);

    expect(h1).toHaveLength(32);
    expect(h1).toBe(h1Later);
    expect(h1).not.toBe(h2);
  });

  it("extracts referrer host safely", () => {
    expect(parseReferrer("https://news.ycombinator.com/item?id=1")).toEqual({
      referrerHost: "news.ycombinator.com",
      referrerUrl: "https://news.ycombinator.com/item?id=1",
    });
    expect(parseReferrer("javascript:alert(1)")).toEqual({
      referrerHost: null,
      referrerUrl: null,
    });
  });
});
