# Shortly — Build Progress

## Environment & Tooling Findings
- OS: Windows
- Node.js: v22.14.0 (`npm` 10.9.2)
- Git: 2.49.0 (`main` branch in `d:\url_shortner`)
- Docker: v26.1.4 CLI installed; Docker daemon is not running on this host. `docker-compose.yml` is provided for Docker hosts, and `scripts/local-db.mjs` runs real PostgreSQL 17.12 (`embedded-postgres`) locally on `localhost:5432` with `shortly` and `shortly_test` databases.

## Phase Status

| Phase | Name | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | Repo inspection, architecture, ADRs, env validation | Done | `bb7782c` | Architecture, 4 ADRs, `.env.example`, `PROGRESS.md` |
| 2 | Setup: Next.js, Tailwind, Prisma, local PG, health/ready | Done | `d23d751` | Next.js 16.4.6, Prisma 6.19.3, Zod 4.6.7, Pino, Vitest |
| 3 | Schema + migrations + seed | Done | `17bccac` | Initial migration `20261125164841_init` applied to `shortly` and `shortly_test` |
| 4 | Services + REST API + error envelope | Done | `17bccac` | Validators, repository, services, REST CRUD, 51 tests green |
| 5 | Code generation + redirect engine | Done | `0d1ef8e` | `GET /:code`, UA/bot parser, non-blocking click ingestion, 404/410 pages |
| 6 | Auth + authorization | Done | `3703740` | Auth.js v5, credentials + lockout + reset + profile + cascade delete + IDOR matrix |
| 7 | Frontend: design system, landing, auth, dashboard, link CRUD | Done | `v0.1-core` | Theme toggle, landing shortener, auth flows, dashboard, mobile cards, settings |
| 8 | Analytics collection + dashboards + QR | Done | `v0.1-core` | Overview + per-link SQL analytics, Recharts, heatmap, PNG/SVG QR studio |
| — | **Core Checkpoint (`v0.1-core`)** | **Done** | `v0.1-core` | 8/8 Vitest files (63/63 tests), 4/4 Playwright E2E + axe, production build green |
| 9 | Redis cache, queue, rollups, k6 load tests | In Progress | - | |
| 10 | Security hardening, rate limiting, headers, audit | Pending | - | |
| 11 | Wow features (Section 4, priority order) | Pending | - | |
| 12 | Full regression, accessibility, docs, CI, Docker prod image | Pending | - | |

## Phase 7 & 8 / Core Checkpoint Evidence
- `npm run lint` -> 0 errors, 0 warnings
- `npm run typecheck` -> `tsc --noEmit` passed
- `npm test` -> 8 files, 63/63 tests passed (unit + real PostgreSQL integration)
- `npm run build` -> Next.js 16.4.6 production build succeeded (25 static/dynamic routes)
- `npx playwright test` -> 4/4 passed (Chromium desktop + Pixel 7 mobile):
  - Landing live shortener + dark mode + axe WCAG 2a/2aa (0 critical/serious violations)
  - Full lifecycle: register -> dashboard (axe clean) -> create link -> fresh context 302 Location -> click count incremented -> QR PNG verified -> edit alias (old 404, new 302) -> disable (410) -> password unlock -> delete (404)
