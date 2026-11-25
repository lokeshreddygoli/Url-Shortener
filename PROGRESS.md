# Shortly — Build Progress

## Environment & Tooling Findings
- OS: Windows
- Node.js: v22.14.0 (`npm` 10.9.2)
- Git: 2.49.0 (initialized `main` branch in `d:\url_shortner`)
- Docker: v26.1.4 + Compose v2.29.2 installed (daemon check pending startup)
- Native Postgres/Redis/k6: not pre-installed natively; Postgres & Redis will run via Docker Compose (and k6 via Docker `grafana/k6` if needed).

## Phase Status

| Phase | Name | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | Repo inspection, architecture, ADRs, env validation | In Progress | - | Architecture, ADRs, `.env.example`, `PROGRESS.md` created; `src/lib/env.ts` to be added with Next.js setup in Phase 2 |
| 2 | Setup: Next.js, Tailwind, shadcn, Prisma, Docker Compose | Pending | - | |
| 3 | Schema + migrations + seed | Pending | - | |
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

## Key Architectural Decisions
- **ADR-001:** Default `302 Found` with `Cache-Control: no-store` for accurate analytics; optional `307` and opt-in `301` with browser caching warning.
- **ADR-002:** 7-character Base62 short codes generated via `crypto.randomInt` with bounded collision retries ($62^7 \approx 3.52 \times 10^{12}$ space).
- **ADR-003:** Redis cache-aside with explicit invalidation on link update/disable/delete + short-TTL negative caching for 404s.
- **ADR-004:** Non-blocking click ingestion via Redis queue + batch DB inserts with graceful fallback to direct DB insert when Redis is unavailable; salted daily-rotating visitor hashes (zero raw IP persistence).

## Commands Run
- `Get-ChildItem -Force; node -v; npm -v; git --version; docker --version; docker compose version` (verified clean directory, Node v22.14.0, npm 10.9.2, Docker 26.1.4)
- `git init -b main`

## Known Issues / Blockers
- Docker daemon was not running during initial inspection; will start Docker Desktop in Phase 2 before spinning up PostgreSQL and Redis containers.
