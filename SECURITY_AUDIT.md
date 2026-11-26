# Shortly — Security Audit Report (`SECURITY_AUDIT.md`)

**Author:** Lokesh Reddy ([lokeshreddygoli2005@gmail.com](mailto:lokeshreddygoli2005@gmail.com))

---

## 1. Threat Verification Matrix

Every attack surface below was audited against actual route handlers, services, validators, and integration tests:

| Vector | Defense Implemented & Verified | Audit Status |
|---|---|---|
| **SSRF / Internal Probing** | `validateAndNormalizeDestinationUrl()` (`src/lib/validators/url.ts`) enforces `http:`/`https:`, rejects `localhost`/`.local`/`.internal`, RFC1918 IPv4 (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254.169.254`), loopback (`127/8`, `::1`), IPv4-mapped IPv6 (`::ffff:127.0.0.1`), ULA (`fc00::/7`), hex/octal/decimal IP encodings, and own host (`APP_URL`); re-checked at redirect time (`redirect.service.ts`) and in `preview.service.ts` (`redirect: "manual"`). | **PASS** |
| **Open Redirects** | Only validated `http:`/`https:` destinations stored; redirect service re-validates destination URL prior to returning `Location` header. | **PASS** |
| **XSS & Unsafe Protocols** | `javascript:`, `data:`, `vbscript:`, `file:` rejected by Zod validators; `next.config.ts` enforces strict `Content-Security-Policy` (`default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`); `/docs` bookmarklet refactored cleanly via DOM `ref` without React HTML injection. | **PASS** |
| **CSRF** | `assertSameOriginIfBrowser()` enforced on `/api/urls`, `/api/urls/:id`, `/api/urls/bulk`, `/api/urls/unlock`, `/api/urls/warning-proceed`, `/api/keys`, `/api/webhooks`, `/api/utm-presets`, `/api/account`, `/api/admin`. Auth.js uses `HttpOnly`, `SameSite=Lax`, and environment-aware `Secure` cookies (`src/lib/cookie-options.ts`). | **PASS** |
| **SQL Injection** | All DB reads/writes use Prisma parameterized queries (`Prisma.sql` tagged templates in raw SQL for `DailyLinkStats` upserts and click batch inserts); zero unparameterized SQL concatenation. | **PASS** |
| **IDOR / Broken Object Level Auth** | User A cannot view, edit, delete, export, or inspect analytics/keys/webhooks/rules belonging to User B (`404`/`403` enforced across repositories & services; verified in `tests/integration/auth-idor.test.ts`). | **PASS** |
| **API Key Scope & Rate Limit Bypass** | Fixed in `bbca12b` (**AUD-02**): API keys strictly enforce `links:read`, `links:write`, and `analytics:read` scopes (`403 INSUFFICIENT_SCOPE`) and honor per-key `rateLimitPerMin` alongside per-IP limits. Keys are stored as SHA-256 hashes; raw secrets appear once at creation and are masked/redacted in logs. | **PASS** |
| **Auth Brute-Force & Lockout** | `bcryptjs` password hashing; 5 failed login attempts lock account for 15 minutes (`AUTH_LOCKED`); sliding-window IP rate limits wired on `POST /api/auth/[...nextauth]` (`RATE_LIMITS.AUTH_LOGIN`) and `POST /api/auth/reset-password` (`RATE_LIMITS.AUTH_FORGOT`) in `bbca12b` (**AUD-03**). | **PASS** |
| **Gate Bypass & Production Secret Fallbacks** | Fixed in `bbca12b` (**AUD-06**): `/api/urls/unlock` and `/api/urls/warning-proceed` enforce CSRF origin checks + link expiry checks; gate HMAC signing, guest claim HMAC signing, and analytics daily hash helpers throw if secrets are absent in `NODE_ENV=production`. | **PASS** |
| **Webhook Signature Verification** | Outgoing webhooks sign `{timestamp}.{payload}` with HMAC-SHA256 (`X-Shortly-Signature`, `X-Shortly-Timestamp`) and retry with bounded delivery logging. | **PASS** |
| **Privilege Escalation** | `/admin` and `/api/admin` strictly verify `role === "ADMIN"` from DB-backed caller context. | **PASS** |
| **Privacy / Raw IP Leakage** | Raw visitor IPs are never stored in `ClickEvent` or `DailyLinkStats`; only a daily-rotating `HMAC-SHA256(ANALYTICS_HASH_SECRET:YYYY-MM-DD, ip|ua)` is stored (`src/lib/request-meta.ts`). Pino redacts `authorization`, `cookie`, `password`, `token`, `apiKey`. | **PASS** |

---

## 2. Dependency Audit (`npm audit`) Investigation

- **Stage 1 Remediation Applied:** Upgraded `vitest` and `@vitest/coverage-v8` from `3.2.7` → `5.1.2`, resolving all **2 critical** (`tinypool <=2.1.1`) and **5 moderate** (`@vitest/mocker`, `glob`, `minimatch`, `test-exclude`) advisories in the dev/test tree.
- **Native Zero-Dependency SMTP:** Implemented `SmtpEmailTransport` in `src/lib/email.ts` using Node.js built-in `node:net` and `node:tls` (with CRLF header injection sanitization) rather than adding `nodemailer` (which currently carries 15 high upstream advisories in `<=10.1.3`).
- **Commands Run:** `npm audit --omit=dev` and `npm audit`.
- **Remaining Findings (Accepted CLI-Only Exception):**
  - **0 Critical**, **0 Moderate**, **0 Low** vulnerabilities across both production and full dependency trees.
  - **4 High** transitive advisories (`deepmerge-ts <8.0.0`, `effect <=3.22.0`) pulled exclusively by `@prisma/config@6.19.3` via `prisma@6.19.3` (surfaced in `--omit=dev` through `@prisma/client` `peerDependencies`). `6.19.3` is the final Prisma `6.x` release; `npm audit` suggests `prisma@7.10.1` (`isSemVerMajor: true`), which introduces breaking schema/driver-adapter changes (`url = env("DATABASE_URL")` removal + `@prisma/adapter-pg`), and `@prisma/config@7.10.1` still pins `effect@3.20.0`. Because `@prisma/config` is strictly Prisma CLI configuration tooling (`@prisma/client` has `dependencies: undefined`) and zero runtime Next.js HTTP/API routes import it, this exception is documented and accepted for `v1.0.0`.

---

## 3. Production Hardening Assumptions & Recommendations
- **Reverse Proxy IP Trust:** `extractClientIp()` trusts `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip`. Always deploy behind a proxy (Nginx, Caddy, Cloudflare, Vercel) configured to strip/overwrite incoming forwarding headers from untrusted clients so IP rate limits cannot be spoofed.
- **Secret Rotation:** Manage `AUTH_SECRET`, `ANALYTICS_HASH_SECRET`, and `GUEST_CLAIM_SECRET` (≥ 32 random chars) outside version control via secrets manager / platform env vars.
