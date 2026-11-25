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
| 2 | Setup: Next.js, Tailwind, Prisma, local PG, health/ready | Done | pending | Next.js 16.4.6, Prisma 6.19.3, Zod 4.6.7, Pino, Vitest, lint/typecheck/build/smoke passed |
| 3 | Schema + migrations + seed | In Progress | - | Full relational schema, migrations, and separate `seed-demo.ts` |
| 4 | Services + REST API + error envelope | Pending | - | |
| 5 | Code generation + redirect engine | Pending | - | |
| 6 | Auth + authorization | Pending | - | |
| 7 | Frontend: design system, landing, auth, dashboard, link CRUD | Pending | - | |
| 8 | Analytics collection + dashboards + QR | Pending | - | |
| — | Core Checkpoint (`v0.1-core`) | Pending | - | |
| 9 | Redis cache, queue, rollups, k6 load tests | Pending | - | |
| 10 | Security hardening, rate limiting, headers, audit | Pending | - | |
| 11 | Wow features (Section 4, priority order) | Pending | - | |
| 12 | Full regression, accessibility, docs, CI, Docker prod image | Pending | - | |

## Phase 2 Evidence
- `npx prisma generate` -> generated Prisma Client v6.19.3.
- `npm run lint` -> passed with 0 warnings/errors.
- `npm run typecheck` -> `tsc --noEmit` passed with 0 errors.
- `npm test` -> `tests/unit/env.test.ts` (2/2 passed).
- `npm run build` -> Next.js 16.4.6 Turbopack production build succeeded.
- Smoke test (`next start -p 3099`):
  - `GET /api/health` -> `200` `{"data":{"status":"ok",...}}`
  - `GET /api/ready` -> `200` `{"data":{"status":"degraded","checks":{"database":{"connected":true,"latencyMs":78},"redis":{"configured":true,"connected":false,"latencyMs":null}}}}`

## Key Architectural Decisions
- **ADR-001:** Default `302 Found` with `Cache-Control: no-store` for accurate analytics; optional `307` and opt-in `301` with browser caching warning.
- **ADR-002:** 7-character Base62 short codes generated via `crypto.randomInt` with bounded collision retries and case-insensitive normalized uniqueness.
- **ADR-003:** Redis cache-aside with explicit invalidation on link update/disable/delete + short-TTL negative caching for 404s.
- **ADR-004:** Non-blocking click ingestion via Redis queue + batch DB inserts with graceful fallback to direct DB insert when Redis is unavailable; salted daily-rotating visitor hashes (zero raw IP persistence).
