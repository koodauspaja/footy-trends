# 528 — One shoot-out rule for SQL and the tables: decisions

Bug #528 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`SHOOTOUT_STORED`.** Half a shoot-out is not one: each side is subtracted
  only when both are stored, the rule `withoutShootout` in `standings.ts`
  applies for the tables and team panels. Subtracting each on its own gave a
  match with one side stored a different score here than there.
