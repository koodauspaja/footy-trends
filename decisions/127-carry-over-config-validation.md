# 127 — Every carry-over entry validated against TASO: decisions

Chore #127 had no record of its own; #531 created this one for reasons cut
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

## Moved from comments, 2026-10-07

Cut from `tests/integration/taso.test.ts` at `79f2c6a` by #531.

- **Where the carry-over validation is tested.** A synthetic version sat in
  `tests/integration/taso.test.ts`, building matches whose win, draw and
  loss counts were engineered to total KuPS's real 67 points from 32 games.
  That proved `calculateStandings` can add up, which its own tests cover,
  while proving nothing about `CARRY_OVER_CONFIG`, the thing that fails
  silently when wrong: removing an entry left it green. The replacement
  drives the real `getSeasonStandings` over captured TASO matches and
  asserts each split group against TASO's own published standings, for
  every configured season.
