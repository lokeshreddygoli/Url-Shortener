# ADR-004: Asynchronous Click Ingestion and Daily-Rotating Visitor Hashing

## Status
Accepted

## Context
Recording analytics synchronously inside `GET /:code` adds database write latency to every redirect and couples redirect availability to analytics write throughput. Additionally, storing raw client IP addresses creates GDPR/privacy liability.

## Decision
1. **Non-blocking ingestion:** Redirects enqueue click payloads into a Redis list/stream (`shortly:clicks:queue`) and flush in batches (every 1000 ms or 50 events) via a background flusher into PostgreSQL (`ClickEvent` + `DailyLinkStats`).
2. **Graceful fallback & shutdown:** If Redis is unavailable, click persistence falls back to an asynchronous fire-and-forget DB insert wrapped in error logging. Graceful shutdown hooks (`SIGTERM`/`SIGINT`) drain in-memory/queued events before process exit.
3. **Privacy-first visitor hashing:** Raw IP addresses are never persisted. Unique visitor estimation uses `HMAC-SHA256(secret + ":" + YYYY-MM-DD, ip + "|" + userAgent)` truncated to 32 hex chars, making cross-day tracking mathematically infeasible without the daily-rotated key.

## Consequences
- Redirect latency is decoupled from database write latency.
- Unique visitor counts are accurate within each UTC day without storing PII.
