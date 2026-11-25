# ADR-003: Redirect Cache-Aside with Explicit Invalidation and Negative Caching

## Status
Accepted

## Context
`GET /:code` is the hottest path in the application and targets `p95 < 50 ms` on cache hits. However, stale cache entries would violate correctness when links are edited, disabled, deleted, or hit their click limit.

## Decision
- Use Redis cache-aside keyed by `shortly:link:<normalizedCode>` with a short TTL (60 seconds).
- Explicitly invalidate (`DEL`) the cache key on every `PATCH`, `DELETE`, disable, rule change, or click-limit exhaustion.
- Cache missing codes (`404`) as a sentinel (`shortly:neg:<normalizedCode>`) with a short TTL (15 seconds) to absorb enumeration and scanner traffic without hitting PostgreSQL; invalidate the negative key immediately if a link is created with that alias/code.
- If Redis is unreachable or times out, transparently fall back to PostgreSQL without failing the redirect.

## Consequences
- Correctness takes priority over infinite TTL; worst-case staleness from un-invalidated edge cases is bounded to 60 seconds, and mutated links are invalidated immediately.
- Enumeration spikes hit Redis negative cache instead of saturating DB connections.
