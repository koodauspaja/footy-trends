# 299 — The unit suite does not depend on its declaration order: decisions

Chore #299 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `tests/unit/app/domestic/standings/page.test.tsx` at `c12c30a` by #531.

- **`beforeEach` at file level.** The two `describe`s below the first used
  to inherit whatever the last test of the first one happened to leave, and
  passed only because they are declared in that order.

Cut from `tests/unit/app/domestic/team/[id]/page.test.tsx` at `c12c30a` by #531.

- **The same in the team page's tests.** The `describe`s started from
  whatever the previous one's last test left behind: a failed match lookup, a
  competition renamed for one assertion. Without restoring the two hoisted
  mocks, everything declared after the Naisten Liiga case was named by that
  case and not by its own arrangement.

## Moved from comments, 2026-10-08

Cut from `tests/unit/lib/standings-service.test.ts` at `ec04260` by #531.

- **The resets in `standings-service.test.ts`.** An unconsumed
  `mockReturnValueOnce` was inherited by whatever test ran next, and which
  test that was depended on declaration order. A leftover cache hit failed
  an assertion about what reached `calculateStandings` with "never called",
  and did so only in some orders.
