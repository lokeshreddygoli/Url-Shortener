# Shortly — Build Progress

## Environment & Tooling Findings
- OS: Windows
- Node.js: v22.14.0 (`npm` 10.9.2)
- Git: 2.49.0 (`main` branch in `d:\url_shortner`)
- Docker: v26.1.4 CLI installed; Docker daemon is not running on this host. `docker-compose.yml` is provided for Docker hosts, and `scripts/local-db.mjs` runs real PostgreSQL 17.12 (`embedded-postgres`) locally on `localhost:5432` with `shortly` and `shortly_test` databases.
- Redis: Not running on `localhost:6379` by default; `src/lib/redis.ts` degrades gracefully when Redis is unavailable (`READY 200` with `status: "degraded"`).

## Phase Status

| Phase | Name | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | Repo inspection, architecture, ADRs, env validation | Done | `bb7782c` | Architecture, 4 ADRs, `.env.example`, `PROGRESS.md` |
| 2 | Setup: Next.js, Tailwind, Prisma, local PG, health/ready | Done | `d23d751` | Next.js 16.4.6, Prisma 6.19.3, Zod 4.6.7, Pino, Vitest |
| 3 | Schema + migrations + seed | Done | `17bccac` | Initial migration `20261125164841_init` applied to `shortly` and `shortly_test` |
| 4 | Services + REST API + error envelope | Done | `17bccac` | Validators, repository, services, REST CRUD, 51 tests green |
| 5 | Code generation + redirect engine | Done | `0d1ef8e` | `GET /:code`, UA/bot parser, non-blocking click ingestion, 404/410 pages |
| 6 | Auth + authorization | Done | pending | Auth.js v5, credentials + lockout + reset + profile + cascade delete + IDOR matrix |
| 7 | Frontend: design system, landing, auth, dashboard, link CRUD | In Progress | - | |
| 8 | Analytics collection + dashboards + QR | Pending | - | |
| — | Core Checkpoint (`v0.1-core`) | Pending | - | |
| 9 | Redis cache, queue, rollups, k6 load tests | Pending | - | |
| 10 | Security hardening, rate limiting, headers, audit | Pending | - | |
| 11 | Wow features (Section 4, priority order) | Pending | - | |
| 12 | Full regression, accessibility, docs, CI, Docker prod image | Pending | - | |

## Phase 6 Evidence
- `npm run lint` -> 0 errors, 0 warnings
- `npm run typecheck` -> `tsc --noEmit` passed
- `npm test` -> 7 files, 61/61 tests passed (`tests/integration/auth-idor.test.ts` verified register, 409 duplicate email, 5-attempt lockout, password reset, full IDOR matrix across users, CSRF origin check, and cascade account deletion)
- `npm run build` -> Next.js 16.4.6 production build succeeded
