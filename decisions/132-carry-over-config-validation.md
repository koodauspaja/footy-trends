# 132 — Every carry-over entry validated against TASO: decisions

Chore #132 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso-standings-service.ts` at `a86c1cb` by #531.

- **`CARRY_OVER_CONFIG`.** Every entry is asserted against TASO's own published
  standings in `tests/unit/lib/taso-carry-over.test.ts`. Adding a season
  without its fixture there fails that file's coverage check.
- **`listCarryOverEntries`.** Exported so that test can assert the config
  exactly: a wrong entry is invisible in production, since the table still
  renders, with wrong points. Flattened on purpose: exposing only the
  competition ids would let a new group be added to an already-fixtured season
  (`spljp25: { 2: 1, 3: 1, 4: 1 }`) with no test covering it.
