# Shortly — Build Progress

## Environment & Tooling Findings
- OS: Windows
- Node.js: v22.14.0 (`npm` 10.9.2)
- Git: 2.49.0 (`main` branch in `d:\url_shortner`)
- Docker: v26.1.4 CLI installed; Docker daemon is not running on this host. `docker-compose.yml` is provided for Docker hosts, and `scripts/local-db.mjs` runs real PostgreSQL 17.12 (`embedded-postgres`) locally on `localhost:5432` with `shortly` and `shortly_test` databases.
- Redis: Redis 3.0.504 running locally on `localhost:6379` (`PONG`); `k6` v2.4.0 installed locally.

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
| — | **Core Checkpoint (`v0.1-core`)** | **Done** | `b33d064` | 8/8 Vitest files (63/63), 4/4 Playwright E2E + axe, build green |
| 9 | Redis cache, queue, rollups, k6 load tests | Done | `fe4d7ac` | Redis cache-aside + click queue, `EXPLAIN ANALYZE`, k6 before/after benchmarks |
| 10 | Security hardening, rate limiting, headers, audit | Done | pending | Sliding-window rate limiter, CSP/security headers, `SECURITY.md`, 70/70 tests |
| 11 | Wow features (Section 4, priority order) | In Progress | - | SSE live feed, routing/A-B, UTM presets, previews, safety scan, API keys/OpenAPI, webhooks, bulk CSV, Cmd+K, bookmarklet, admin |
| 12 | Full regression, accessibility, docs, CI, Docker prod image | Pending | - | |

## Phase 10 Evidence
- `npm run lint` -> 0 errors, 0 warnings
- `npm run typecheck` -> `tsc --noEmit` passed
- `npm test` -> 11 files, 70/70 tests passed (`tests/unit/rate-limit.test.ts` and `tests/integration/security-hardening.test.ts` verified sliding-window `429` + `Retry-After` + `X-RateLimit-*` headers, unlock brute-force throttling, and sanitized 500 responses).
- `npm audit --omit=dev` -> 0 direct dependency vulnerabilities; 4 transitive advisories (`deepmerge-ts`, `effect`) inside `@prisma/config` documented in `docs/SECURITY.md`.
