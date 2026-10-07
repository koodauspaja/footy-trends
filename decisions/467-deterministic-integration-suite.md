# 467 — A deterministic integration suite: decisions

Chore #467 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `vitest.config.ts` at `5b180e0` by #531.

- **`fileParallelism: false` for integration.** `team-search.test.ts`
  clears a whole range of `providerMatchId` in `beforeEach` and `afterEach`
  (it searches by name, so it has to clear everything it might have
  created), and that range covered ids `team-seasons.test.ts` had just
  inserted. Run together the two failed four or five assertions every time
  and passed alone, which is how it reached `main`: a suite that fails on
  timing trains everyone to re-run and not to read. The ids no longer
  overlap either, and `tests/unit/scripts/integration-fixtures.test.ts`
  keeps them apart; sharing a database is the coupling, and an id is only
  the way it showed up first. It costs seconds: the suite is 154 tests and
  runs in about ten.

## Moved from comments, 2026-10-08

Cut from `tests/unit/scripts/integration-fixtures.test.ts` at `a15a9f9` by #531.

- **Ownership is by block.** Raised in review on #469: comparing literal
  ids would record `993200` and miss everything generated from it.
