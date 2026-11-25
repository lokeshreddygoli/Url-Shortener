import { describe, expect, it } from "vitest";
import {
  MAX_URL_LENGTH,
  validateAndNormalizeDestinationUrl,
  validateCustomAlias,
} from "@/lib/validators/url";

describe("destination URL validator (adversarial corpus)", () => {
  const ownAppUrl = "https://shortly.example";

  it("accepts and normalizes valid http/https URLs including IDN punycode", () => {
    const res1 = validateAndNormalizeDestinationUrl("  HTTPS://Example.COM/Path?a=1&b=2  ", ownAppUrl);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.normalizedUrl).toBe("https://example.com/Path?a=1&b=2");
      expect(res1.hostname).toBe("example.com");
    }

    const res2 = validateAndNormalizeDestinationUrl("https://bücher.example/test", ownAppUrl);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.hostname).toBe("xn--bcher-kva.example");
    }
  });

  it.each([
    ["javascript:alert(1)", "javascript scheme"],
    ["JAVASCRIPT:alert(1)", "uppercase javascript scheme"],
    ["data:text/html,<script>alert(1)</script>", "data URI"],
    ["file:///etc/passwd", "file URI"],
    ["vbscript:msgbox(1)", "vbscript URI"],
    ["//evil.com/phish", "protocol-relative URL"],
    ["https://user:pass@example.com/", "embedded credentials"],
    ["https://admin@example.com/", "username in URL"],
    ["http://localhost:3000/test", "localhost"],
    ["http://sub.localhost/test", "subdomain of localhost"],
    ["http://internal.local/admin", ".local hostname"],
    ["http://metadata.internal/latest", ".internal hostname"],
    ["http://127.0.0.1/admin", "IPv4 loopback"],
    ["http://127.42.10.9:8080/", "IPv4 127/8 loopback"],
    ["http://10.0.0.1/", "RFC1918 10/8"],
    ["http://172.16.5.4/", "RFC1918 172.16/12"],
    ["http://192.168.1.1/", "RFC1918 192.168/16"],
    ["http://169.254.169.254/latest/meta-data/", "AWS metadata link-local"],
    ["http://0.0.0.0/", "0.0.0.0/8"],
    ["http://100.64.0.1/", "CGNAT 100.64/10"],
    ["http://[::1]/", "IPv6 loopback"],
    ["http://[::ffff:127.0.0.1]/", "IPv4-mapped IPv6 loopback"],
    ["http://[::ffff:10.0.0.1]/", "IPv4-mapped IPv6 private"],
    ["http://[fe80::1]/", "IPv6 link-local"],
    ["http://[fc00::1]/", "IPv6 ULA"],
    ["http://2130706433/", "decimal IPv4 loopback"],
    ["http://0x7f000001/", "hex IPv4 loopback"],
    ["http://0177.0.0.1/", "octal IPv4 loopback"],
    ["https://shortly.example/abc", "own domain redirect loop"],
    ["https://example.com/a\nb", "embedded newline"],
    ["https://example.com/" + "a".repeat(MAX_URL_LENGTH), "exceeds max length"],
  ])("rejects %s (%s)", (input) => {
    const res = validateAndNormalizeDestinationUrl(input, ownAppUrl);
    expect(res.ok).toBe(false);
  });
});

describe("custom alias validator", () => {
  it("accepts valid aliases and preserves display case with lowercased normalizedCode", () => {
    const res = validateCustomAlias("Launch_2026-v1");
    expect(res).toEqual({
      ok: true,
      alias: "Launch_2026-v1",
      normalizedCode: "launch_2026-v1",
    });
  });

  it.each(["ab", "a".repeat(33), "bad alias", "bad/alias", "api", "Dashboard", "ADMIN", "_next", "health"])(
    "rejects invalid or reserved alias '%s'",
    (alias) => {
      expect(validateCustomAlias(alias).ok).toBe(false);
    }
  );
});
