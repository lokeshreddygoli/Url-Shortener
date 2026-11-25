# Shortly — Production Deployment Guide (`DEPLOYMENT_GUIDE.md`)

**Author:** Lokesh Reddy ([lokeshreddygoli2005@gmail.com](mailto:lokeshreddygoli2005@gmail.com))

---

## 1. Pre-Deployment Verification & Production Requirements

Before deploying Shortly to production (`NODE_ENV=production`), verify every item below:

### Required Environment Variables
Generate distinct cryptographically random 32+ byte secrets (for example with `openssl rand -base64 32`):
- `DATABASE_URL`: PostgreSQL 16/17 connection string (with SSL enabled in managed DBs, e.g. `?sslmode=require`).
- `REDIS_URL`: Redis connection string (Redis 6/7+ or Redis 3+ fallback; TLS `rediss://` recommended over public networks).
- `AUTH_SECRET`: ≥ 32 chars (Auth.js JWT signing & gate/unlock HMAC cookies). Application throws in `NODE_ENV=production` if unset or `< 32` chars.
- `ANALYTICS_HASH_SECRET`: ≥ 32 chars (daily-rotating HMAC-SHA256 `visitorHash`). Required in production.
- `GUEST_CLAIM_SECRET`: ≥ 32 chars (signed guest link claim tokens). Required in production.
- `APP_URL` and `NEXTAUTH_URL`: Exact public `https://` origin (e.g., `https://short.example.com`). Auth.js and gate cookies (`src/lib/cookie-options.ts`) automatically set `Secure` cookies when `APP_URL`/`NEXTAUTH_URL` starts with `https://`.
- `AUTH_TRUST_HOST`: Set `true` when running behind a reverse proxy / load balancer (Nginx, Caddy, Cloudflare, Vercel).

### Optional Production Integrations
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Enables Google OAuth when both are set.
- `EMAIL_PROVIDER="smtp"`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Real SMTP delivery for password resets (defaults to `console` logger in dev).
- `GOOGLE_SAFE_BROWSING_API_KEY`: Enables Google Safe Browsing v4 API checks alongside built-in SSRF/heuristic checks.
- `REDIRECT_RATE_LIMIT`: Default `600` requests/min/IP on `GET /:code` (override if needed).
- `LOG_LEVEL`: `info` (JSON structured logs via Pino with automatic redaction of `authorization`, `cookie`, `password`, `token`, `apiKey`).

---

## 2. Security, Reverse Proxy & Headers Checklist

- **HTTPS Termination:** Terminate TLS at your reverse proxy / CDN and forward `X-Forwarded-Proto: https` and `X-Forwarded-For` cleanly. Configure your proxy (e.g., Nginx `proxy_set_header X-Forwarded-For $remote_addr;` or Cloudflare edge) to overwrite client-supplied forwarding headers so rate limiting cannot be spoofed.
- **Security Headers (`next.config.ts`):** Already injects `Content-Security-Policy` (`frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and production `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- **Health & Readiness Probes:**
  - Liveness: `GET /api/health` (`200 OK` if Node server responds).
  - Readiness: `GET /api/ready` (`200` when Postgres reachable — `"ready"` if Redis healthy or `"degraded"` if Redis unreachable; `503 SERVICE_UNAVAILABLE` if Postgres down or env invalid).
- **Graceful Shutdown:** Container `SIGTERM`/`SIGINT` triggers `flushPendingClicks()` in `src/server/services/analytics-ingest.service.ts` to drain buffered Redis click batches before exit. Set `stop_grace_period: 15s` in Compose/orchestrators.

---

## 3. Option A — Self-Hosted Docker Compose Deployment (VPS / VM)

1. **Provision server** with Docker Engine + Docker Compose v2 and point DNS (`A`/`AAAA`) to your VPS behind Caddy or Nginx TLS.
2. **Clone repository & create production `.env`:**
   ```bash
   git clone <your-repo-url> shortly && cd shortly
   cp .env.example .env
   # Edit .env: set NODE_ENV=production, https:// APP_URL/NEXTAUTH_URL, strong AUTH_SECRET, ANALYTICS_HASH_SECRET, GUEST_CLAIM_SECRET, and non-default POSTGRES password
   ```
3. **Inspect `Dockerfile` & `docker-compose.yml`:**
   - Multi-stage `Dockerfile` runs as non-root user `nextjs:nodejs` (`uid 1001`) using Next.js `standalone` output and runs `npx prisma migrate deploy && node server.js` on container start.
   - `docker-compose.yml` configures `postgres:17-alpine` (`pg_isready` healthcheck), `redis:7-alpine` (`--appendonly yes`, `redis-cli ping` healthcheck), and `app` (`wget -qO- http://127.0.0.1:3000/api/ready` healthcheck).
4. **Build and launch:**
   ```bash
   docker compose up --build -d
   docker compose ps
   curl -fsS https://your-domain.com/api/ready
   ```
   *(Important honesty note: Docker CLI v26.1.4 is present in the verification environment, but the Docker daemon was not running on the Windows host, so `docker compose up --build` could not be executed live during this audit.)*

---

## 4. Option B — Managed PaaS Deployment (Vercel + Neon Postgres + Upstash Redis)

1. **Database (Neon / Supabase / RDS PostgreSQL 16+):** Create database and copy pooled + direct `DATABASE_URL` strings.
2. **Cache/Queue (Upstash Redis):** Create Redis database and copy TLS `rediss://` URL as `REDIS_URL`.
3. **Deploy App (Vercel):**
   - Import repo; set build command: `npx prisma migrate deploy && npm run build`.
   - Configure all production environment variables (`NODE_ENV=production`, `APP_URL`, `NEXTAUTH_URL`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ANALYTICS_HASH_SECRET`, `GUEST_CLAIM_SECRET`, `AUTH_TRUST_HOST=true`).
   - Verify `https://<your-domain>/api/ready` returns `status: "ready"`.

---

## 5. Database Backup & Recovery Strategy

1. **Automated Daily Backups (Docker / VPS cron):**
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --no-owner --file="shortly-$(date +%F).dump"
   ```
   Store encrypted dumps off-host (S3/R2/Backblaze) with 14–30 day retention.
2. **Test Restores Monthly:**
   ```bash
   pg_restore --clean --if-exists --dbname="$RESTORE_DATABASE_URL" shortly-YYYY-MM-DD.dump
   npx prisma migrate status
   ```
3. **Redis Durability:** Configured with `--appendonly yes` (`AOF`). Because PostgreSQL holds all canonical links and flushed analytics (`DailyLinkStats` + `ClickEvent`), Redis is safely ephemeral/recoverable: even after total Redis loss, cache warms automatically on redirect misses and crash-safe Lua processing prevents lost clicks while queued clicks are in flight.
