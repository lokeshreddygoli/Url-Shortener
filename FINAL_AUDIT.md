# Shortly — Final Independent Production Audit (`FINAL_AUDIT.md`)

**Audit Scope:** Full source-code, database, API, security, frontend, infrastructure, and documentation inspection across `d:\url_shortner` (`HEAD` at `a7f3eb8`).
**Auditor Role:** Principal Software Engineer, Production Reliability Engineer, Security Auditor, DevOps Engineer, QA Lead.

---

## 1. Environment Snapshot at Audit Start
- **OS:** Windows (`v22.14.0` Node.js, `npm` `10.9.2`)
- **Database:** PostgreSQL 17.12 running via `embedded-postgres` (`scripts/local-db.mjs`) on `127.0.0.1:5432` (`shortly` & `shortly_test`).
- **Redis:** Redis `3.0.504` running natively on `127.0.0.1:6379`.
- **Docker:** CLI v26.1.4 installed, **daemon not running** (`//./pipe/docker_engine` unavailable) — live `docker compose up` cannot run on this host without Docker Desktop/daemon.
- **Load tool:** `k6 v2.4.0` installed natively.

---

## 2. Defects & Gaps Identified (Code vs Documentation)

| ID | Severity | Area | File(s) & Lines | Finding | Planned Fix |
|---|---|---|---|---|---|
| **AUD-01** | **High** | Queue Reliability | `src/server/services/analytics-ingest.service.ts:135-166` | `LRANGE` + `LTRIM` inside `MULTI` removes clicks from `shortly:clicks:queue` before `persistClickBatch` commits. A worker crash mid-flush loses clicks permanently, and `ClickEventPayload` has no idempotency `eventId` to prevent double-counting during crash recovery. | Replace with atomic Lua move (`queue` → `processing` list) + idempotent `eventId` (`ClickEvent.id`) using `INSERT ... ON CONFLICT ("id") DO NOTHING RETURNING` so crashes mid-flush never lose or double-count clicks. Add crash-simulation test. |
| **AUD-02** | **High** | Auth & API Keys | `src/app/api/urls/route.ts`, `src/app/api/urls/[id]/route.ts`, `src/app/api/urls/bulk/route.ts`, `src/app/api/analytics/overview/route.ts`, `src/app/api/urls/[id]/analytics/route.ts` | (a) API key scopes (`links:read`, `links:write`, `analytics:read`) are not enforced on `/api/urls`, `/api/urls/:id`, `/api/urls/bulk`, `/api/analytics/overview`, or `/api/urls/:id/analytics`. (b) `caller.rateLimitPerMin` from `ApiKey` is ignored in `POST /api/urls`. (c) Authenticated users are only rate-limited per user, not per IP+user. | Enforce `links:read` / `links:write` / `analytics:read` scopes for `via === "api-key"`, apply `caller.rateLimitPerMin` for API keys, and enforce both per-IP and per-user limits on `POST /api/urls`. |
| **AUD-03** | **High** | Brute-Force Protection | `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/auth/reset-password/route.ts` | `POST /api/auth/callback/credentials` and `POST /api/auth/reset-password` have no sliding-window rate limiting per IP (`RATE_LIMITS.AUTH_LOGIN` was defined in `rate-limit.ts` but never wired). | Wire `RATE_LIMITS.AUTH_LOGIN` into `POST` on `[...nextauth]/route.ts` (for credentials callback) and `RATE_LIMITS.AUTH_FORGOT` into `/api/auth/reset-password`. |
| **AUD-04** | **Medium** | Safety Scanner & Webhooks | `src/server/services/url.service.ts:306-308`, `src/server/services/redirect.service.ts:200` | (a) `updateUrl` updates `originalUrl` without re-running `scanDestinationSafety`, allowing a benign link to be edited to a malicious URL without triggering `FLAGGED` status. (b) `link.expired` webhook event is documented in `WEBHOOK_EVENTS` but never dispatched when an expired link is resolved. | Re-run `scanDestinationSafety` on `originalUrl` updates; dispatch `link.expired` webhook (once, debounced via Redis/flag) when an expired link is hit. |
| **AUD-05** | **Medium** | Bookmarklet Integration | `src/app/docs/page.tsx:26-27`, `src/components/features/landing-shortener.tsx` | Bookmarklet hardcodes `http://localhost:3000/?url=...` and `LandingShortener` ignores `?url=` query parameter on load. | Derive origin dynamically on `/docs` (`window.location.origin`) and pre-fill `LandingShortener` from `?url=` query param. |
| **AUD-06** | **Medium** | Gate Endpoints & Secrets | `src/app/api/urls/unlock/route.ts`, `src/app/api/urls/warning-proceed/route.ts`, `src/server/services/redirect.service.ts:48,61`, `src/lib/guest-claim.ts:10`, `src/lib/request-meta.ts:38` | (a) `unlock` and `warning-proceed` lack `assertSameOriginIfBrowser`, and `warning-proceed` doesn't check `expiresAt`. (b) Gate cookie, guest claim, and analytics hash helpers fall back to hardcoded strings even if `NODE_ENV === "production"`. | Add `assertSameOriginIfBrowser` + expiry check; throw in `NODE_ENV === "production"` if required secrets are missing. |
| **AUD-07** | **Low** | UI Analytics Completeness | `src/components/features/link-detail-client.tsx` | API returns `variants` stats for A/B split rules, and `TIME_WINDOW` is supported by backend, but `LinkDetailClient` does not display per-variant A/B performance breakdown. | Render A/B split / routing variant stats panel in `LinkDetailClient` and allow `TIME_WINDOW` rule creation in UI. |
| **AUD-08** | **Low** | Cross-Browser & Perf Coverage | `playwright.config.ts`, `vitest`, `README.md` | (a) Playwright tests only run `chromium` & `mobile-chrome` (missing `firefox` & `webkit`). (b) Lighthouse has not been run on `/`, `/login`, `/dashboard`. (c) `src/server/services` branch coverage is `69.45%` (< 80%). (d) `README.md` needs relative links, `Live demo`, `Screenshots`, `Benchmarks (methodology and limits)`, and author attribution. | Add `firefox` and `webkit` Playwright projects; run Lighthouse CI/CLI on `/`, `/login`, `/dashboard` and remediate any score < 90; raise `src/server/services` branch coverage > 80%; update `README.md` and `PROGRESS.md`. |

---

## 3. Initial Verification Baseline
- **PostgreSQL:** `shortly` & `shortly_test` accessible on `127.0.0.1:5432` via `scripts/local-db.mjs`.
- **Redis:** `redis-server` 3.0.504 active on `127.0.0.1:6379` (`PONG`).
- **Docker:** Daemon unavailable on Windows host — documented accurately.
