# Shortly — Build Progress

## Environment & Tooling Findings
- OS: Windows
- Node.js: v22.14.0 (`npm` 10.9.2)
- Git: 2.49.0 (`main` branch in `d:\url_shortner`)
- Docker: v26.1.4 CLI installed; Docker daemon is not running on this host. `docker-compose.yml` + `Dockerfile` are provided for Docker hosts, and `scripts/local-db.mjs` runs real PostgreSQL 17.12 (`embedded-postgres`) locally on `localhost:5432` with `shortly` and `shortly_test` databases.
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
| 10 | Security hardening, rate limiting, headers, audit | Done | `3967968` | Sliding-window rate limiter, CSP/security headers, `SECURITY.md`, 70/70 tests |
| 11 | Wow features (Section 4, priority order) | Done | pending | SSE live stream, smart routing/A-B, UTM presets, previews, safety scan, API keys + OpenAPI 3, HMAC webhooks, CSV import/export, ⌘K, bookmarklet, admin |
| 12 | Full regression, accessibility, docs, CI, Docker prod image | In Progress | - | `Dockerfile`, CI workflow, `README.md`, `INTERVIEW_NOTES.md`, final coverage & regression |

## Phase 11 Evidence
- `npm run lint` -> 0 errors, 0 warnings
- `npm run typecheck` -> `tsc --noEmit` passed
- `npm test` -> 12 files, 74/74 tests passed (`tests/integration/wow-features.test.ts` verified safety scanning & warning redirect, smart device routing, scoped Bearer API keys + revocation, CSV import row-level error reporting + CSV export, HMAC-SHA256 webhook signing, OpenAPI 3.0.3 spec, and admin RBAC).
- `npm run build` -> Next.js 16.4.6 production build succeeded (34 routes).
