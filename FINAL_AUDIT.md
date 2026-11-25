# Shortly — Final Independent Production Audit (`FINAL_AUDIT.md`)

**Audit Scope:** Full source-code, database, API, security, frontend, infrastructure, and documentation inspection across `d:\url_shortner` (started at `a7f3eb8`, remediated through `7075ec6`+).
**Auditor Role:** Principal Software Engineer, Production Reliability Engineer, Security Auditor, DevOps Engineer, QA Lead.
**Author:** Lokesh Reddy ([lokeshreddygoli2005@gmail.com](mailto:lokeshreddygoli2005@gmail.com))

---

## 1. Environment Snapshot
- **OS:** Windows (`Node.js v22.14.0`, `npm 10.9.2`)
- **Database:** PostgreSQL `17.12` running via `embedded-postgres` (`scripts/local-db.mjs`) on `127.0.0.1:5432` (`shortly` & `shortly_test`).
- **Redis:** Redis `3.0.504` running natively on `127.0.0.1:6379`.
- **Docker:** CLI `v26.1.4` installed, **daemon not running on host** (`//./pipe/docker_engine` unavailable) — `docker compose up --build` could not be executed live on this Windows host.
- **Load & Audit Tools:** `k6 v2.4.0`, Playwright `1.65.1` (`chromium`, `firefox`, `webkit`, `mobile-chrome`), Lighthouse.

---

## 2. Audit Findings & Verified Resolutions

| ID | Severity | Area | File(s) | Finding | Resolution & Verification | Commit |
|---|---|---|---|---|---|---|
| **AUD-01** | **High** | Queue Reliability | `src/server/services/analytics-ingest.service.ts`, `src/server/services/redirect.service.ts` | `LRANGE` + `LTRIM` removed clicks from `shortly:clicks:queue` before `persistClickBatch` committed; no idempotency key (`eventId`) existed to guard against double-counting. | Replaced with atomic Lua batch move (`shortly:clicks:queue` → `shortly:clicks:processing`, Redis 3.0 & 7+ compatible) + `eventId` (`ClickEvent.id`) `INSERT ... ON CONFLICT ("id") DO NOTHING RETURNING`. Verified crash-before-persist and crash-after-commit tests in `tests/integration/cache-queue.test.ts` (4/4 passed). | `a50811d` |
| **AUD-02** | **High** | Auth & API Keys | `src/app/api/urls/route.ts`, `[id]/route.ts`, `bulk/route.ts`, `analytics/overview/route.ts`, `urls/[id]/analytics/route.ts`, `src/server/auth/request-context.ts` | API key scopes (`links:read`, `links:write`, `analytics:read`) and `rateLimitPerMin` were not enforced; authenticated `POST /api/urls` did not combine per-IP and per-user limits. | Enforced `assertApiKeyScope`, wired `caller.rateLimitPerMin`, and applied both per-IP and per-user/per-key sliding-window rate limits. Tested in `tests/integration/audit-fixes-and-branches.test.ts`. | `bbca12b` |
| **AUD-03** | **High** | Brute-Force Protection | `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/auth/reset-password/route.ts` | Credentials login and password reset lacked per-IP sliding-window rate limiting (`RATE_LIMITS.AUTH_LOGIN` unused). | Wired `RATE_LIMITS.AUTH_LOGIN` on credentials callback `POST` and `RATE_LIMITS.AUTH_FORGOT` on `reset-password` `POST`. Verified `429` enforcement in integration tests. | `bbca12b` |
| **AUD-04** | **Medium** | Safety Scanner & Webhooks | `src/server/services/url.service.ts`, `src/server/services/redirect.service.ts` | `updateUrl` updated `originalUrl` without re-scanning destination safety; `link.expired` webhook event was never dispatched. | Re-ran `scanDestinationSafety` on `originalUrl` updates; dispatched debounced `link.expired` webhook when expired links are resolved. Verified in `tests/integration/audit-fixes-and-branches.test.ts`. | `bbca12b` |
| **AUD-05** | **Medium** | Bookmarklet Integration | `src/app/docs/page.tsx`, `src/components/features/landing-shortener.tsx` | Bookmarklet hardcoded `http://localhost:3000/?url=...`, triggered React 19 `javascript:` URL warning, and `LandingShortener` ignored `?url=`. | Used dynamic `window.location.origin`, attached `javascript:` bookmarklet cleanly via DOM `ref` + copy action, and pre-filled `LandingShortener` from `?url=`. | `bbca12b`, `2690c22` |
| **AUD-06** | **Medium** | Gate Endpoints & Secrets | `src/app/api/urls/unlock/route.ts`, `warning-proceed/route.ts`, `src/server/services/redirect.service.ts`, `src/lib/guest-claim.ts`, `src/lib/request-meta.ts` | `unlock` & `warning-proceed` lacked CSRF origin checks (`warning-proceed` also omitted `expiresAt`), and signing helpers had fallback strings even in production. | Added `assertSameOriginIfBrowser`, expiry validation, and `NODE_ENV === "production"` secret throws. Verified `403`/throws in integration tests. | `bbca12b` |
| **AUD-07** | **Low** | UI Analytics Completeness | `src/components/features/link-detail-client.tsx` | A/B variant performance stats and `TIME_WINDOW` rule creation were missing in the Link Detail UI. | Added A/B variant stats breakdown and `TIME_WINDOW` rule support in `LinkDetailClient`. Verified typecheck + E2E render. | `bbca12b` |
| **AUD-08** | **Low** | Cross-Browser, Coverage, Perf & Docs | `playwright.config.ts`, `src/lib/cookie-options.ts`, `src/app/layout.tsx`, `src/components/*`, `README.md` | Playwright lacked Firefox/WebKit (`Secure` cookie issue over HTTP localhost in WebKit); `/` Lighthouse Perf was 82 (<90); service branch coverage was 69.45% (<80%); `README.md` lacked screenshots, methodology/limits, and author info. | Fixed `isSecureCookieEnv()`, enabled `chromium` + `firefox` + `webkit` + `mobile-chrome` (8/8 pass); optimized font display/prefetching/`CommandPalette` (**100/100/100/100** Desktop & Mobile Lighthouse); raised `src/server/services` branch coverage to **81.6%**; rewrote `README.md` + reports. | `2690c22`, `576c728`, `7075ec6` |

---

## 3. Residual Limitations & Operational Notes
- **Docker Compose Live Execution:** Not tested live because the Windows Docker daemon (`//./pipe/docker_engine`) is stopped; static `Dockerfile` and `docker-compose.yml` were inspected cleanly.
- **`npm audit --omit=dev`:** Reports 4 high transitive vulnerabilities (`deepmerge-ts`, `effect`) inside `@prisma/config` (Prisma `6.19.3` CLI config tooling; fix requires breaking major upgrade `prisma@7.10.1`). Zero runtime HTTP/Auth/Redis vulnerabilities exist.
- **Reverse Proxy Header Trust:** `extractClientIp()` reads `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip`; production deployments behind proxies must strip/overwrite client-spoofed headers at the edge proxy (documented in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)).
