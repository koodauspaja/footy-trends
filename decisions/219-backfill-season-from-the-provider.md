# 219 — The backfill takes the current TASO season from the provider: decisions

Bug #219 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-08

Cut from `tests/unit/scripts/backfill-run.test.ts` at `a15a9f9` by #531.

- **What `backfill-run.test.ts` guards.** The bug was not a wrong
  calculation; every function involved was correct. It was the wrong input:
  the backfill took the current TASO season from
  `new Date().getUTCFullYear()` while the app discovers it from the provider.
  The first attempt at the fix reached for `resolveTasoSeasonContext` and did
  not finish inside ten minutes (measured). The source guard failed on the
  script's own documentation the first time it ran, which is why it strips
  comments. The year-boundary tests pass before and after the fix: they are
  the consequence, not the regression.
