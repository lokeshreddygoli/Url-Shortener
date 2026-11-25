# Shortly — Build Progress

## Environment & Tooling Findings
- OS: Windows
- Node.js: v22.14.0 (`npm` 10.9.2)
- Git: 2.49.0 (`main` branch in `d:\url_shortner`)
- Docker: v26.1.4 CLI installed; Docker daemon is not running on this host (`//./pipe/docker_engine` unavailable), so `docker compose up` could not be executed locally. Local PostgreSQL 17.12 ran via `scripts/local-db.mjs` (`embedded-postgres`), Redis 3.0.504 ran natively on `localhost:6379`, and `k6` v2.4.0 ran natively.

## Phase Status

| Phase | Name | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | Repo inspection, architecture, ADRs, env validation | Done | `bb7782c` | Architecture, 4 ADRs, `.env.example`, `PROGRESS.md` |
| 2 | Setup: Next.js, Tailwind, Prisma, local PG, health/ready | Done | `d23d751` | Next.js 16.4.6, Prisma 6.19.3, Zod 4.6.7, Pino, Vitest |
| 3 | Schema + migrations + seed | Done | `17bccac` | Initial migration `20261125164841_init` applied to `shortly` and `shortly_test` |
| 4 | Services + REST API + error envelope | Done | `17bccac` | Validators, repository, services, REST CRUD, 51 tests green |
| 5 | Code generation + redirect engine | Done | `0d1ef8e` | `GET /:code`, UA/bot parser, non-blocking click ingestion, 404/410 pages |
| 6 | Auth + authorization | Done | `3703740` | Auth.js v5, credentials + lockout + reset + profile + cascade delete + IDOR matrix |
| 7 | Frontend: design system, landing, auth, dashboard, link CRUD | Done | `b33d064` | Theme toggle, landing shortener, auth flows, dashboard, mobile cards, settings |
| 8 | Analytics collection + dashboards + QR | Done | `b33d064` | Overview + per-link SQL analytics, Recharts, heatmap, PNG/SVG QR studio |
| — | **Core Checkpoint (`v0.1-core`)** | **Done** | `b33d064` | Core test suite + Playwright E2E + production build green |
| 9 | Redis cache, queue, rollups, k6 load tests | Done | `fe4d7ac` | Redis cache-aside + click queue, `EXPLAIN ANALYZE`, k6 before/after benchmarks |
| 10 | Security hardening, rate limiting, headers, audit | Done | `3967968` | Sliding-window rate limiter, CSP/security headers, `SECURITY.md`, 70/70 tests |
| 11 | Wow features (Section 4, priority order) | Done | `9549006` | SSE live stream, routing/A-B, UTM presets, previews, safety scan, API keys + OpenAPI 3, webhooks, CSV import/export, ⌘K, bookmarklet, admin |
| 12 | Full regression, accessibility, docs, CI, Docker prod image | Done | final | `Dockerfile`, `.github/workflows/ci.yml`, `README.md`, `INTERVIEW_NOTES.md`, coverage 86.64% |

## Phase 12 Final Evidence
- `npm run lint` -> 0 errors, 0 warnings
- `npm run typecheck` -> `tsc --noEmit` passed (0 errors)
- `npm run test:coverage` -> 13 files, 79/79 tests passed; 86.64% statements/lines, 93.45% functions across `src/lib/**` and `src/server/**`
- `npm run build` -> Next.js 16.4.6 production build succeeded (34 static/dynamic routes)
- `npx playwright test` -> 4/4 passed across `chromium` desktop and `mobile-chrome` (Pixel 7) including axe-core WCAG 2a/2aa scans, security header checks, `/docs`, QR PNG download, edit/disable/410/password-unlock/delete flows
- `k6 run tests/load/redirect-benchmark.k6.js` -> redirect `p95 = 90.05 ms` without Redis vs **`p95 = 43.21 ms`** with Redis (`0.00%` errors)

## Known Unverified Items on Host
- `docker compose up --build` could not be executed live because Docker daemon is not running on this host.
- WebKit Playwright browser and Lighthouse CLI audit were not run locally (axe-core WCAG checks ran in Chromium & Mobile Chrome).
