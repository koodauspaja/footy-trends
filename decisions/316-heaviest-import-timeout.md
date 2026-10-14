# 316 — The heaviest import has a timeout that fits its cost: decisions

Bug #316 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-08

Cut from `tests/unit/lib/current-user.test.ts` at `ec04260` by #531.

- **Why `current-user.test.ts` sets its own timeout.** Transforming the
  graph cold costs 500-640 ms on an idle machine and was measured between
  588 and 1266 ms while the other 111 files were running, a 2.5x spread
  across three runs. Vitest's 5 s default left no room for the tail of that
  distribution, and the file failed roughly once in ten full runs with
  `Test timed out in 5000ms`, never in isolation.
