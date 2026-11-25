# Shortly v1.0.0 — Release Candidate Checklist (`RELEASE_CHECKLIST.md`)

**Release Version:** `1.0.0` (`package.json`, `package-lock.json`, OpenAPI `1.0.0`)
**Release Engineer:** Autonomous Principal Release Verification (Author: Lokesh Reddy — `lokeshreddygoli2005@gmail.com`)
**Overall Verdict:** **CODE-VERIFIED RELEASE CANDIDATE — NOT YET LIVE-DEPLOYED** (Local/code/CI gates pass; external cloud provisioning, live container runtime verification, and live OAuth/SMTP credentials are incomplete — see blockers below).

---

## Release Gate Status Matrix

| # | Release Requirement | Status | Verified Scope / Blocker Details |
|---|---|---|---|
| **1** | Inspect existing audit & verification reports | **PASS** | Reviewed [FINAL_AUDIT.md](FINAL_AUDIT.md), [FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md), [SECURITY_AUDIT.md](SECURITY_AUDIT.md), [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md), [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md), and [PROGRESS.md](PROGRESS.md). |
| **2** | Resolve high/critical production dependency vulnerabilities (compatible fixes) | **UNRESOLVED (CLI-ONLY / NO COMPATIBLE FIX)** | `npm audit --omit=dev` shows **0 critical** and **4 high** transitive advisories (`deepmerge-ts <8.0.0`, `effect <=3.22.0`) inside `@prisma/config` via `prisma@6.19.3` (`@prisma/client` `peerDependencies`). `6.19.3` is the latest Prisma 6.x patch; resolving requires breaking major upgrade to `prisma@7.10.1`. Zero runtime app/API code imports `@prisma/config`. |
| **3** | Verify Prisma compatibility, migrations & integration tests | **PASS** | Verified `@prisma/client@6.19.3`, `prisma@6.19.3`, `@auth/prisma-adapter@2.11.3`; `npx prisma validate`, `npx prisma generate`, and `npx prisma migrate deploy` passed on both `shortly` and `shortly_test`; all 14 Vitest files (85/85 tests) passed. |
| **4** | Run Playwright suite across Chromium, Firefox, WebKit & Mobile Chrome | **PASS** | Fixed WebKit metadata-title race & `/docs` `networkidle` session abort race in [tests/e2e/core-flows.spec.ts](tests/e2e/core-flows.spec.ts); **8/8 passed** across `chromium`, `firefox`, `webkit`, and `mobile-chrome` (with axe-core WCAG 2a/2aa scans). |
| **5** | Run ESLint, TypeScript, Vitest coverage, production build & npm audit | **PASS (AUDIT REPORTED)** | `npm run lint` (0 errors), `npm run typecheck` (0 errors), `npm run test:coverage` (14/14 files, 85/85 tests, `91.43%` stmts, `81.64%` services branches), `npm run build` (`next build` standalone succeeded); standalone `node server.js` boot verified; `npm audit` output recorded verbatim. |
| **6** | Fix every reproducible regression | **PASS** | Diagnosed and fixed both reproducible WebKit Playwright regressions uncovered during RC verification; re-ran full Playwright suite to 8/8 green. |
| **7** | Verify Docker Compose with PostgreSQL & Redis containers | **BLOCKED ON HOST** | `docker info` failed: Docker daemon not running on Windows host (`//./pipe/docker_engine` unavailable). `Dockerfile` (`node server.js` standalone path) was verified outside Docker against local PG 17.12 & Redis 3.0.504, but multi-container Compose boot remains **unverified live**. |
| **8** | Test Redis failure, PostgreSQL failure, app restart, queue recovery & graceful shutdown | **PASS** | Verified live in `verify-release-chaos.mjs`: PG failure (`503 SERVICE_UNAVAILABLE`), Redis failure (`degraded` + `302` + direct DB click persistence), fresh server restart recovery of orphaned `shortly:clicks:processing` + `shortly:clicks:queue` without double-counting duplicate `eventId`, and `SIGTERM` exit. |
| **9** | Verify environment config & ensure no secrets committed | **PASS** | `git ls-files .env*` tracks only `.env.example`; `.env` has 55–56 char secrets (`AUTH_SECRET`, `ANALYTICS_HASH_SECRET`, `GUEST_CLAIM_SECRET`) untracked; `git grep` secret scan found zero real secrets in tracked files. |
| **10** | Verify Google OAuth, SMTP & external integrations | **PARTIAL / NO LIVE CREDENTIALS** | `.env` has empty `GOOGLE_CLIENT_ID`/`SECRET` and `GOOGLE_SAFE_BROWSING_API_KEY`; `EMAIL_PROVIDER=console`. Verified conditional OAuth wiring (`src/auth.ts`) and Safe Browsing timeout fallback (`safety-scanner.service.ts`). **Gap:** [src/lib/email.ts](src/lib/email.ts) currently implements `ConsoleEmailTransport` only (no live SMTP sender wired yet). |
| **11** | Prepare real public deployment via `DEPLOYMENT_GUIDE.md` | **BLOCKED (UNPROVISIONED)** | No managed remote Postgres (`DATABASE_URL` is `localhost`), no managed remote Redis (`localhost`), no linked Vercel project for `shortly`, and Docker daemon stopped. Cannot deploy live without external DB/Redis provisioning. |
| **12** | Verify HTTPS, custom domain, redirects, DB persistence & analytics post-deploy | **BLOCKED (DEPENDS ON #11)** | Cannot be verified until public deployment with TLS/custom domain and managed Postgres/Redis is provisioned. |

---

## Mandatory Sign-Off Items Before Public Production Cutover
1. Provision managed PostgreSQL 16/17 and Redis (or run `docker compose up --build -d` on a Docker host and execute `.github/workflows/ci.yml` + `docker compose ps` verification).
2. Implement an SMTP/transactional email adapter in [src/lib/email.ts](src/lib/email.ts) if password-reset emails are required in production (`EMAIL_PROVIDER=smtp`), or configure Google OAuth / Safe Browsing API keys.
3. Configure production environment variables (`NODE_ENV=production`, `https://` `APP_URL` & `NEXTAUTH_URL`, distinct 32+ char secrets, `AUTH_TRUST_HOST=true`, reverse-proxy `X-Forwarded-For` overwrite).
4. Execute post-deploy smoke checks against the live `https://` custom domain (`/api/ready`, link creation, `302` redirect, Postgres persistence, analytics charts, TLS certificate, and HSTS/`Secure` cookies).
