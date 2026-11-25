# Shortly v1.0.0 — Release Candidate Report (`RELEASE_REPORT.md`)

**Version:** `1.0.0`
**Date:** `2026-11-26` (`Asia/Calcutta` UTC+05:30)
**Target Environment Audited:** Windows (`Node.js v22.14.0`, `npm 10.9.2`), local PostgreSQL `17.12` (`embedded-postgres`), native Redis `3.0.504`, Playwright `1.65.1`, Vercel CLI `41.6.0` (authenticated, no `shortly` project or cloud DB provisioned).

---

## 1. Executive Release Determination

Shortly `v1.0.0` passes **all local code quality, database migration, Vitest integration/unit coverage, standalone server build, chaos/queue recovery, and 4-browser Playwright E2E/a11y gates**.

However, **public production readiness cannot yet be claimed** because three infrastructure/external prerequisites remain incomplete in this environment:
1. **Docker Compose live execution (`#7`)** is blocked because the Docker daemon is not running (`//./pipe/docker_engine` unavailable).
2. **Live cloud deployment & post-deploy HTTPS/custom-domain verification (`#11`, `#12`)** cannot run without provisioned remote PostgreSQL, remote Redis, and DNS/custom-domain targets (current `.env` points to `localhost`).
3. **External credentials (`#10`)**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_SAFE_BROWSING_API_KEY` are empty, and [src/lib/email.ts](src/lib/email.ts) currently implements `ConsoleEmailTransport` only (no live SMTP driver).

---

## 2. Exact Commands & Observed Outputs

### A. Version Sync, Prisma Compatibility & Migrations
- Updated `"version": "1.0.0"` in [package.json](package.json) and ran `npm install --package-lock-only` → `up to date, audited 752 packages in 6s`.
- `npx prisma validate` → `The schema at prisma\schema.prisma is valid`.
- `npx prisma generate` → `Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 182ms`.
- `npx prisma migrate deploy` (against `shortly` and `shortly_test`):
  - `1 migration found in prisma/migrations` (`20261125164841_init`) → `No pending migrations to apply.`

### B. Lint, Typecheck, Vitest Coverage & Production Build
- `npm run lint` (`eslint .`) → **exit 0** (0 errors, 0 warnings).
- `npm run typecheck` (`tsc --noEmit`) → **exit 0** (0 errors).
- `npm run test:coverage` (`vitest run --coverage`) → **exit 0**:
  - `Test Files  14 passed (14)`
  - `Tests       85 passed (85)` (`Duration 20.95s`)
  - V8 Coverage `All files`: **`91.43%` Stmts | `78.43%` Branch | `95.53%` Funcs | `91.43%` Lines**
  - V8 Coverage `server/services`: **`92.32%` Stmts | `81.64%` Branch | `95.91%` Funcs | `92.32%` Lines**
- `npm run build` (`next build` 16.4.6 Turbopack) → **exit 0** (34 static/dynamic routes, `output: "standalone"` artifact `.next/standalone/server.js` generated).
- Standalone entrypoint test (`verify-standalone.mjs`, `NODE_ENV=production`, running `node .next/standalone/server.js` with `.next/static` & `public`):
  - `STANDALONE_SERVER_VERIFIED: { readyStatus: 200, statusField: 'ready', homeStatus: 200, createdCode: 'cIMzk2P', redirectStatus: 302, location: 'https://example.com/standalone-probe' }`.

### C. Cross-Browser E2E Regression & Fix (`Playwright`)
During release testing on `1.0.0`, Playwright uncovered two WebKit-specific timing races in [tests/e2e/core-flows.spec.ts](tests/e2e/core-flows.spec.ts):
1. `axe-core` `document-title` (`wcag242`) on client transition to `/dashboard` before streaming metadata committed → resolved by asserting `await expect(page).toHaveTitle(/Dashboard/)` before running `AxeBuilder`.
2. In-flight `fetch("/api/auth/session")` aborted on fast navigation from `/docs` to `/?url=...`, triggering Auth.js `ClientFetchError: Load failed` in WebKit console → resolved by waiting for `waitUntil: "networkidle"` on those navigations in the test.

Re-run result of `npx playwright test` after final edit:
- **8 passed (1.4m)** — 0 failed, 0 skipped:
  - `[chromium]`: landing/dark-mode/axe (`4.2s`), full lifecycle (`11.4s`)
  - `[firefox]`: landing/dark-mode/axe (`8.9s`), full lifecycle (`20.4s`)
  - `[webkit]`: landing/dark-mode/axe (`3.8s`), full lifecycle (`13.5s`)
  - `[mobile-chrome]` (Pixel 7): landing/dark-mode/axe (`2.7s`), full lifecycle (`6.2s`)

### D. Failure-Mode, Restart, Queue Recovery & Graceful Shutdown Verification
Executed `verify-release-chaos.mjs` against `next start` (`1.0.0` build) + PostgreSQL `17.12` + Redis `3.0.504`:
1. **PostgreSQL Failure (`DATABASE_URL` unreachable port 5999):**
   - `PG_FAILURE_CHECK: PASS (health=200, ready=503 SERVICE_UNAVAILABLE)`
2. **Redis Failure (`REDIS_URL` unreachable port 6399):**
   - `REDIS_FAILURE_FALLBACK: PASS (ready=200 degraded, redirect=302, direct DB clickCount=1)`
3. **Application Restart & Orphaned Queue Recovery + Idempotency:**
   - Pre-seeded `shortly:clicks:processing` with 1 already-committed `eventId` (`clickCount` initially `1`) and 1 uncommitted `eventId`, plus 1 event in `shortly:clicks:queue`; booted fresh `next start` process and triggered `GET /rcRecov1` (`302`).
   - `APP_RESTART_QUEUE_RECOVERY: PASS (clickCount=4, duplicate skipped, queue=0, processing=0)`
4. **Graceful Shutdown Signal:**
   - Sent `SIGTERM` to `next start` child process → `GRACEFUL_SHUTDOWN_SIGNAL: { code: null, sig: 'SIGTERM' }`.

---

## 3. Dependency Vulnerability Audit (`npm audit`)

### Production Graph (`npm audit --omit=dev`)
- **Result:** `0 critical`, **`4 high`**, `0 moderate`, `0 low`.
- **Root Cause & Compatibility Assessment:**
  - `deepmerge-ts` (`<8.0.0` — GHSA-ggr8-5vv4-36mx) and `effect` (`<=3.22.0` — GHSA-7589-6fvf-x4pw) pulled by `@prisma/config@6.19.3` via `prisma@6.19.3` (surfaced in `--omit=dev` because `@prisma/client@6.19.3` declares `peerDependencies: { prisma: "*" }`).
  - `prisma@6.19.3` is already the newest Prisma `6.x` patch release. `npm audit` recommends `prisma@7.10.1` (`isSemVerMajor: true`), which is a **breaking major upgrade** removing `url = env("DATABASE_URL")` from `schema.prisma` and requiring driver adapters (`@prisma/adapter-pg`).
  - **Risk Impact:** `@prisma/config` is a Prisma CLI configuration package only; `@prisma/client` has `dependencies: undefined` and zero Next.js runtime API/redirect code loads `@prisma/config`, `deepmerge-ts`, or `effect`.

### Full Dev + Prod Graph (`npm audit`)
- **Result:** `11 vulnerabilities (5 moderate, 4 high, 2 critical)`.
- Additional dev-only findings beyond `@prisma/config`:
  - `tinypool <=2.1.1` (`2 critical`, GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr) + `@vitest/mocker` + `glob` + `minimatch` (`5 moderate`) via `vitest@3.2.7` / `@vitest/coverage-v8@3.2.7` (fix requires breaking `vitest@5.1.2` major upgrade; test-runner only, excluded from production bundle).

---

## 4. Environment, Secrets & Deployment Evidence

- **Git Secret Hygiene:**
  - `git ls-files .env*` outputs only `.env.example`.
  - Local `.env` sets `AUTH_SECRET` (len 56), `ANALYTICS_HASH_SECRET` (len 55), `GUEST_CLAIM_SECRET` (len 55) — untracked.
  - `git grep` across tracked source files returned only OpenAPI documentation sample strings (`sk_live_...` in `src/app/api/openapi.json/route.ts`, `src/server/auth/request-context.ts`, `src/server/services/api-key.service.ts`).
- **Docker Compose Verification:**
  - `docker info` returned: `ERROR: error during connect: ... open //./pipe/docker_engine: The system cannot find the file specified.`
  - Status: **Not executed live on host** due to stopped Docker daemon.
- **External Integrations & Cloud Deployment Evidence:**
  - `vercel project ls` (Vercel CLI `41.6.0`, user `lokeshreddygoli12`) lists unrelated historical projects only; no `shortly` project, remote PostgreSQL, remote Redis, custom domain, Google OAuth app, Safe Browsing API key, or SMTP credentials exist in `.env`.
  - Live deployment (`#11`) and post-deployment HTTPS / custom domain verification (`#12`) remain **incomplete / blocked** pending external infrastructure provisioning per [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).
