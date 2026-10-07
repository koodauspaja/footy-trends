# 178 — The cup page is measured after its rounds arrive: decisions

Chore #178 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `tests/e2e/cup-domestic.spec.ts` at `0fe724f` by #531.

- **Why `openCupSeason` waits.** Both geometry tests measured straight after
  `page.goto`, and both were wrong for it, in opposite directions. The fold
  test failed intermittently: `scrollHeight` was 812, exactly the viewport,
  so `closed < open / 5` compared 812 against 162. The horizontal-overflow
  test passed in the same state, because an empty document does not
  overflow. It was not flaky; it was silently vacuous, which is worse: it
  would have reported no horizontal scroll on a page that had rendered
  nothing at all. Reproduced deterministically with `waitUntil: "commit"`,
  which returns as soon as the response begins:
  `{ scrollHeight: 812, overflows: false, details: 0 }`.
