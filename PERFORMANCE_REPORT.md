# Shortly — Performance & Reliability Report (`PERFORMANCE_REPORT.md`)

**Environment Tested:** Windows (`Node.js v22.14.0`), PostgreSQL `17.12` (`embedded-postgres`), Redis `3.0.504` (`127.0.0.1:6379`), Next.js `16.4.6` (`next start`), `k6 v2.4.0`.
**Author:** Lokesh Reddy ([lokeshreddygoli2005@gmail.com](mailto:lokeshreddygoli2005@gmail.com))

---

## 1. k6 Load Benchmark (`tests/load/redirect-benchmark.k6.js`)

### Methodology & Limits
- **Workload:** Two concurrent scenarios over 15 seconds:
  - `redirects`: 20 constant VUs issuing `GET /launch-26` (`redirects: 0`, expecting `302` + `Location` header).
  - `creates`: 5 constant VUs issuing `POST /api/urls` every 100ms (guest IP limit `15/min` applies, so `201` and `429` are expected responses via `http.expectedStatuses(201, 429)`).
- **Rate limit isolation:** Because all VUs originate from `127.0.0.1`, `REDIRECT_RATE_LIMIT=100000` was passed to the benchmark server so redirect latency/throughput reflects the engine rather than hitting the default `600/min` per-IP shield. (A baseline run without `REDIRECT_RATE_LIMIT` confirmed the IP limiter trips accurately at hit #601 with `429`.)
- **Limits:** Single-host loopback benchmark where k6, Next.js, PostgreSQL, and Redis share CPU/memory. Numbers measure relative engine performance and Redis cache-aside impact rather than multi-node internet scale.

### Results Comparison

| Metric | PostgreSQL Direct (`REDIS_URL=""`) | Redis Cache-Aside + Click Queue (`redis://localhost:6379`) | Delta |
|---|---:|---:|---|
| Redirects `avg` | 82.16 ms | **30.95 ms** | **2.65× faster** |
| Redirects `min` | 59.96 ms | **14.01 ms** | — |
| Redirects `p50` (median) | 80.13 ms | **27.95 ms** | **2.87× faster** |
| Redirects `p90` | 99.60 ms | **43.77 ms** | — |
| Redirects `p95` (threshold `<150ms`) | 106.52 ms | **52.50 ms** | **2.03× faster** |
| Redirects `p99` | 126.28 ms | **78.68 ms** | **1.60× faster** |
| Overall HTTP `avg` / `p95` / `p99` | 78.53 / 107.21 / 144.78 ms | **31.45 / 52.98 / 81.62 ms** | **2.50× faster avg** |
| Mixed Request Rate | 38.73 req/s (1,743 reqs) | **87.58 req/s (3,941 reqs)** | **2.26× higher RPS** |
| Checks Passed | 3,277 / 3,277 (100.00%) | 7,676 / 7,676 (100.00%) | — |
| `http_req_failed` | 0.00% (0 / 1,743) | **0.00% (0 / 3,941)** | — |

---

## 2. PostgreSQL Index Verification (`node scripts/check-explain.mjs`)

Executed with `SET enable_seqscan = off` against seeded PostgreSQL 17.12:

1. **ShortUrl lookup:**
   - Query: `SELECT ... FROM "ShortUrl" WHERE "normalizedCode" = $1 AND "deletedAt" IS NULL`
   - Plan: `Index Scan using "ShortUrl_normalizedCode_key" on "ShortUrl"` (`Planning: 0.367 ms`, `Execution: 0.456 ms`)
2. **ClickEvent analytics:**
   - Query: `SELECT date_trunc('day', "clickedAt"), COUNT(*) FROM "ClickEvent" WHERE "shortUrlId" = $1 GROUP BY 1`
   - Plan: `Index Scan using "ClickEvent_shortUrlId_visitorHash_idx" on "ClickEvent"` (`Execution: 0.102 ms`)
3. **DailyLinkStats rollup:**
   - Query: `SELECT * FROM "DailyLinkStats" WHERE "shortUrlId" = $1 ORDER BY "day" DESC LIMIT 30`
   - Plan: `Index Scan Backward using "DailyLinkStats_shortUrlId_day_key" on "DailyLinkStats"` (`Execution: 0.058 ms`)

---

## 3. Reliability, Graceful Degradation & Atomic Queue Verification

| Scenario Tested | Observed Behaviour & Verification |
|---|---|
| **PostgreSQL Unavailable** | `GET /api/health` returned `200`; `GET /api/ready` returned `503` with `error.code: "SERVICE_UNAVAILABLE"` and `checks.database.connected: false`. |
| **Redis Unavailable** | `GET /api/ready` returned `200` with `status: "degraded"` and `checks.redis.connected: false`; `GET /launch-26` still returned `302 -> https://nextjs.org/docs/app` via PostgreSQL fallback; rate limiter automatically fell back to in-memory sliding windows (`tests/integration/rate-limit-modes.test.ts` & `verify-reliability.mjs`). |
| **Redis Recovery** | With `redis://127.0.0.1:6379` reachable, `GET /api/ready` returned `200` with `status: "ready"` and `checks.redis.connected: true`. |
| **Cache Population & Scheduled Queue Drain** | Creating `NhbPMHr`, hitting `GET /NhbPMHr` populated `shortly:link:nhbpmhr`; 4 hits drained from `shortly:clicks:queue` (len `0`) and `shortly:clicks:processing` (len `0`) with PostgreSQL `clickCount === 4`. |
| **Atomic Queue Crash Safety** | `tests/integration/cache-queue.test.ts` replaced non-atomic `LRANGE+LTRIM` with atomic Lua `LPOP+RPUSH` (`queue` → `processing`) + idempotent `INSERT ... ON CONFLICT ("id") DO NOTHING RETURNING`; simulated mid-flush crash before DB write lost 0 events and post-commit crash recovery double-counted 0 events. |
| **Cache Invalidation on Update/Delete** | Verified in `tests/integration/cache-queue.test.ts` (`invalidateCachedLink` removes stale cache key immediately upon `PATCH`/`DELETE`). |
| **Docker Compose Container Test** | **Not executed on host:** Docker daemon is unavailable (`//./pipe/docker_engine` missing). Graceful `SIGTERM` queue flush logic (`process.once("SIGTERM", ...)` calling `flushPendingClicks()`) is implemented in `src/server/services/analytics-ingest.service.ts`; multi-process container shutdown timing could not be tested live without Docker. |

---

## 4. Lighthouse Web Performance Audits (`/` · `/login` · `/dashboard`)

Measured against `next start` (`127.0.0.1:3108`) across both Desktop and Mobile profiles:

| Route | Profile | Perf | A11y | Best Practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | Desktop | **100** | **100** | **100** | **100** | 0.3 s | 0.6 s | 10 ms | 0 |
| `/login` | Desktop | **100** | **100** | **100** | **100** | 0.2 s | 0.2 s | 0 ms | 0 |
| `/dashboard` | Desktop | **100** | **100** | **100** | **100** | 0.2 s | 0.3 s | 0 ms | 0 |
| `/` | Mobile | **100** | **100** | **100** | **100** | 0.7 s | 0.8 s | 80 ms | 0 |
| `/login` | Mobile | **100** | **100** | **100** | **100** | 0.6 s | 0.7 s | 30 ms | 0 |
| `/dashboard` | Mobile | **100** | **100** | **100** | **100** | 0.8 s | 0.9 s | 40 ms | 0 |

**Optimizations applied (`576c728`):** Switched Google `Inter` font display to `"optional"` to prevent font-swap LCP penalties on slow 4G, added `prefetch={false}` on secondary `<Link>` items in navigation/footer/CTA, enabled `experimental.optimizePackageImports: ["lucide-react", "recharts"]`, and deferred `CommandPalette` loading until `⌘K`/`Ctrl+K`.
