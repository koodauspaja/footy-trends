# 200 — TASO reads are cached: decisions

Bug #200 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso.ts` at `a86c1cb` by #531.

- **`MATCHES_CACHE_TTL_SECONDS`.** Mirrors football-data's match cache.
- **The cache in `getSeasonMatches`.** A bucket and category pair with no
  matches stores no rows, so `getSyncedSeasonMatches` cannot tell "never
  fetched" from "fetched, and nothing is there" and refreshes on every request.
  The national team pages ask about every year and category combination and
  most are empty; one such pair accounted for 18 requests in a single test run.
