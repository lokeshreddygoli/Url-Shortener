# Shortly — System Design & Backend Interview Notes

1. **Why did you default to `302 Found` with `Cache-Control: no-store` instead of `301 Moved Permanently`?**
   Browsers and CDNs cache `301` aggressively (often indefinitely). Once cached, subsequent clicks never hit the server, breaking click analytics, expiry dates, click limits, password gates, and A/B routing rules. Defaulting to `302` + `no-store` keeps control on the server while offering `307` (method preservation) and opt-in `301` with an explicit UI warning.

2. **How do you prevent short-code collisions under high concurrency?**
   Auto-generated 7-character Base62 codes use `crypto.randomInt(0, 62)` rather than `Math.random()`. PostgreSQL enforces a `UNIQUE` index on `normalizedCode` (lowercased), and `urlService.createUrl` catches Prisma `P2002` unique violations and retries up to 5 times. For custom aliases, concurrent race conditions are resolved atomically by the same `UNIQUE` constraint—tested with 50 parallel requests yielding exactly one `201` and 49 `409 ALIAS_TAKEN` responses.

3. **What is the collision math on 7-character Base62 codes?**
   Case-sensitive Base62 has $62^7 \approx 3.52 \times 10^{12}$ combinations. Because we normalize codes case-insensitively (`36^7 \approx 7.83 \times 10^{10}$), even at 10 million active links the collision probability per insert is $10^7 / 7.83 \times 10^{10} \approx 0.013\%$. Switching to 8 characters expands the case-insensitive space to $36^8 \approx 2.82 \times 10^{12}$.

4. **How do you keep redirects fast without losing analytics accuracy or crashing when Redis is down?**
   Redirects check Redis cache-aside (`shortly:link:<code >`) and negative cache (`shortly:neg:<code>`, 15s TTL). Click events are pushed non-blocking to a Redis list (`shortly:clicks:queue`) and flushed in batches of 50 (or every 1s) using `MULTI` (`LRANGE` + `LTRIM`) into `ClickEvent` and `DailyLinkStats`. If Redis is unreachable, `getRedisClient()` backs off for 10s and falls back directly to PostgreSQL cache bypass + async DB insert + in-memory sliding-window rate limits.

5. **How do you handle cache invalidation correctness?**
   Every `PATCH`, `DELETE`, rule update, bulk disable/delete, or click-limit exhaustion explicitly invalidates `shortly:link:<normalizedCode>` and `shortly:neg:<normalizedCode>`. Link TTL is bounded to 60s as a safety net, prioritizing correctness over infinite cache lifetimes.

6. **How do you prevent SSRF and open-redirect abuse?**
   Destination URLs are validated at creation **and** re-validated at redirect time and during preview fetches. Only `http:` and `https:` are allowed; embedded credentials, `localhost`/`.local`/`.internal`, RFC1918 IPv4, link-local (`169.254.0.0/16`), IPv6 loopback/ULA/link-local, IPv4-mapped IPv6 (`::ffff:127.0.0.1`), decimal/hex/octal IP encodings, and own-domain redirect loops are rejected. Preview fetches also use `redirect: "manual"`, 3s timeouts, and 256 KB read caps.

7. **How do you compute unique visitors without storing PII / raw IPs?**
   `computeDailyVisitorHash` computes `HMAC-SHA256(secret + ":" + YYYY-MM-DD, ip + "|" + userAgent)` truncated to 32 hex chars. Raw IPs are never written to PostgreSQL or logs, and the daily key rotation prevents cross-day user tracking.

8. **What happens if a deleted link still has clicks buffered in the Redis queue?**
   Before inserting a batch (`persistClickBatch`), the worker queries existing `ShortUrl` IDs for the batch and filters out deleted IDs. This prevents foreign-key (`P2003`) poison pills from blocking healthy click events in the queue.

9. **How does the database schema support analytics at scale?**
   `ClickEvent` uses composite indexes `(shortUrlId, clickedAt DESC)`, `(shortUrlId, isBot, clickedAt)`, and `(shortUrlId, visitorHash)`. `DailyLinkStats` maintains pre-aggregated daily rollups (`totalClicks`, `humanClicks`, `botClicks`, `qrClicks`) keyed by `(shortUrlId, day)` so multi-month dashboard views avoid full scans of raw event tables.

10. **What would you change at 100× scale?**
    Partition `ClickEvent` monthly by `clickedAt` (or stream events via Kafka/Redpanda into ClickHouse), shard `ShortUrl` by `hash(normalizedCode)` across Citus/Vitess, move redirect cache lookups to regional edge POPs (Cloudflare Workers/KV + Redis Pub/Sub invalidation), and decouple the batch click flusher into a dedicated worker fleet with dead-letter queues.
