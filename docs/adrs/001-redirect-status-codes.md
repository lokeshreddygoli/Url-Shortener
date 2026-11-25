# ADR-001: Default 302 Redirects vs 301 / 307

## Status
Accepted

## Context
URL shorteners must balance browser caching performance with accurate click analytics, mutable destinations, link expiry, and password/disable gates.

## Decision
- Default to **HTTP `302 Found`** with `Cache-Control: no-store, no-cache, must-revalidate` so every click reaches Shortly's redirect engine.
- Support **`307 Temporary Redirect`** when a user needs HTTP method preservation (e.g., API webhook/POST forwarding).
- Support **`301 Moved Permanently`** only as an explicit opt-in per link, accompanied by a UI warning explaining that browsers aggressively cache `301` responses and future analytics, edits, or link disables may be bypassed by returning visitors.

## Consequences
- Analytics counts, expiry enforcement, click limits, and A/B routing remain accurate for all default links.
- Slight latency cost per click on uncached links, mitigated by Redis caching on the server side (`p95 < 50 ms`).
