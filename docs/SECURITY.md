# Shortly — Security Threat Model

## 1. Protected Assets
- **User credentials & sessions:** Passwords, password reset tokens, Auth.js JWT signing secret (`AUTH_SECRET`), API key hashes, webhook HMAC secrets.
- **Link integrity:** Mapping between `normalizedCode` and `originalUrl` (tampering would enable phishing/redirect hijacking).
- **Visitor privacy:** Client IP addresses and User-Agents (never persisted in raw form).
- **Platform availability & internal network:** Prevention of SSRF against internal metadata services, DB saturation, and enumeration floods.

## 2. Threat Matrix & Mitigations

| Threat | Impact | Mitigation |
|---|---|---|
| **SSRF / Internal Port Probing** | Exfiltration of `169.254.169.254` or internal services | Strict `http:`/`https:` check; blocks `localhost`, `.local`, `.internal`, RFC1918 IPv4, loopback/ULA/link-local IPv6, IPv4-mapped IPv6 (`::ffff:127.0.0.1`), hex/octal/decimal IP encodings, and own domain; re-validated at redirect time AND during link preview fetch (`redirect: "manual"`). |
| **XSS / Open Redirect Abuse** | Arbitrary script execution via `javascript:` or `data:` | Protocol allowlist (`http:`/`https:` only) enforced on Zod validation and redirect resolution; strict `Content-Security-Policy` with `frame-ancestors 'none'`. |
| **IDOR (Broken Object Level Auth)** | User A reads/edits/deletes User B's links, analytics, keys, or webhooks | Every repository/service query scopes or asserts `userId === caller.userId` (unless `ADMIN`); tested via dedicated IDOR matrix integration suite. |
| **Credential Brute-Force & Password Link Guessing** | Account takeover or unauthorized link unlock | `bcryptjs` hashing; 5-attempt account lockout (15m); sliding-window rate limits (`429` + `Retry-After`) on `/api/auth/*` and `/api/urls/unlock`. |
| **CSRF on Cookie Sessions** | Cross-site mutations on authenticated sessions | Auth.js `HttpOnly`, `SameSite=Lax`, `Secure` (prod) cookies + `assertSameOriginIfBrowser` origin/host check on state-changing routes. |
| **Link Enumeration & Scanning** | DB load spike or discovery of private links | Cryptographic 7-char Base62 codes (`crypto.randomInt`, non-sequential); cheap regex guard before DB; 15s Redis negative cache for 404s; per-IP rate limiting. |
| **PII Exposure in Analytics** | Raw IP leakage in DB dumps or logs | Daily-rotating salted HMAC-SHA256 `visitorHash` (`ANALYTICS_HASH_SECRET`); Pino logger redacts `authorization`, `cookie`, `password`, `token`, `apiKey`. |
| **Malicious Destinations** | Hosting phishing/malware short links | Pluggable safety scanner (Google Safe Browsing v4 + local heuristic/punycode/blocked-domain checks) routing flagged links to an interstitial `/warning/:code` page. |

## 3. Operational Practices
- Startup environment validation (`src/lib/env.ts`) fails fast if secrets are missing or below 32 characters.
- No stack traces or raw Prisma/SQL errors are ever returned to API clients; unexpected errors log server-side with a `requestId` returned in `meta.requestId`.
- `npm audit` and `gitleaks` run in CI (`.github/workflows/ci.yml`).
- **Dependency Audit Note (`npm audit --omit=dev`):** Currently reports 4 transitive high advisories (`deepmerge-ts`, `effect`) inside `@prisma/config` (Prisma 6.19.3 CLI dependency); upgrading to Prisma 7 is a breaking major change tracked for future upgrade and does not affect runtime request paths.
