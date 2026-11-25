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
| 9 | Redis cache, queue, rollups, k6 load tests | Done | pending | Redis cache-aside + click queue, `EXPLAIN ANALYZE`, k6 before/after benchmarks |
| 10 | Security hardening, rate limiting, headers, audit | In Progress | - | Sliding-window rate limiter, CSP/security headers, `SECURITY.md`, audit |
| 11 | Wow features (Section 4, priority order) | Pending | - | |
| 12 | Full regression, accessibility, docs, CI, Docker prod image | Pending | - | |

## Phase 9 Evidence
- `npm test` -> 9 files, 66/66 passed (`tests/integration/cache-queue.test.ts` verified Redis cache hit + invalidation + queue batch flush + Redis-down direct DB fallback).
- `node scripts/check-explain.mjs` -> verified `Index Scan using "ShortUrl_normalizedCode_key"` (`0.062 ms`), `ClickEvent` index scan (`0.195 ms`), and `DailyLinkStats_shortUrlId_day_key` (`0.034 ms`).
- `k6 run tests/load/redirect-benchmark.k6.js` (25 VUs, 15s):
  - Without Redis: redirect `p95 = 90.05 ms` (`med = 64.68 ms`), `60.1 req/s`, `0.00%` error rate.
  - With Redis: redirect `p95 = 43.21 ms` (`med = 26.27 ms`), `105.2 req/s`, `0.00%` error rate.
