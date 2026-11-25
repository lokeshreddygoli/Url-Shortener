# ADR-002: Cryptographic 7-Character Base62 Short Code Generation

## Status
Accepted

## Context
Short codes must be compact, URL-safe, unpredictable (non-sequential to prevent link enumeration), and collision-resistant under concurrent creation.

## Decision
- Generate 7-character codes from the Base62 alphabet (`0-9a-zA-Z`, 62 characters) using Node's `crypto.randomInt(0, 62)` (never `Math.random`).
- Enforce a `UNIQUE` constraint on normalized `code` in PostgreSQL and retry up to 5 times on unique-constraint violations (`P2002`).
- Separate custom aliases (`3-32` chars, `[a-zA-Z0-9-_]`, case-insensitive uniqueness via `citext` or lowercase column) from generated codes (case-sensitive Base62 or canonical code lookup—see schema rules). Note: to preserve case-insensitive alias UX while supporting Base62 codes, `ShortUrl` stores `code` (exact display) and `normalizedCode` (lowercased, unique index) or uses case-insensitive uniqueness; wait: if Base62 uses uppercase+lowercase (`62^7`), lowercasing reduces effective space to `36^7` (`7.83e10`), which is still massive ($78.3$ billion codes!). Using lowercase-normalized uniqueness for both prevents confusing `Abc1234` vs `abc1234` collisions while still giving $36^7 \approx 7.83 \times 10^{10}$ (or case-sensitive for generated 7-char codes if exact match is used, while custom aliases are case-insensitive).
  - Clarification: Base62 (`0-9a-zA-Z`) gives $62^7 = 3,521,614,606,208 \approx 3.52 \times 10^{12}$ combinations if case-sensitive, and $36^7 \approx 7.83 \times 10^{10}$ if case-insensitive. We store `normalizedCode = code.toLowerCase()` with a `UNIQUE` index so custom aliases and generated codes never collide regardless of casing, and still have $>78$ billion unique 7-char combinations (at 10M links, collision probability per insert is $10^7 / 7.83 \times 10^{10} \approx 0.013\%$).

## Consequences
- Zero sequential ID leakage; enumeration by incrementing integers is impossible.
- Concurrent creation safety is guaranteed by the database unique constraint + bounded retry loop.
