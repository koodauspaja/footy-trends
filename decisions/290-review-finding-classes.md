# 290 — What reviews keep finding, and a repeatable tally: decisions

Chore #290 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/review-findings-plan.ts` at `5b180e0` by #531.

- **`review-findings-plan.ts`.** The same split as `backfill-plan.ts` and
  `e2e-freshness-plan.ts` and their entry points. The classes are not
  invented: each comes from reading every Sourcery inline finding on the
  last fourteen merged pull requests, and they are what
  `skills/self-review.md` is organised around. Re-running the command is how
  the list stays honest as the codebase changes. On 2026-09-08 it was seven
  classes, from 48 findings across nine pull requests. Re-measure before
  trusting the ordering, and do not edit it by hand without running the
  command. A review often describes one defect while mentioning another, so
  the table says which class to weight while reading your own diff; it does
  not replace reading the findings.
- **`CLASSES`.** The document and the command have to say the same words, or
  the table cannot be compared with the document it points at. "The test",
  not "test": a parser finding that mentions a test in passing belongs under
  parsing, and the scoring settles that.
- **`classify` scores.** First-match-wins was the earlier design and it
  misfiled the obvious case: a parser finding saying "the test asserts an
  invalid id" mentions a test once and parsing three times. The list is
  ordered by how much each class has cost because ties fall to the earlier
  class.
- **`mergedPullNumbers`.** A long-lived branch merged this morning would
  otherwise be missed while an older merge was counted in its place.
- **`REVIEWER`.** Human review comments arrive as conversation ("why this
  and not that?") and are not the same measurement.
- **`tally`.** A growing unclassified pile is the signal that the classes
  themselves need revisiting, and sorting it by size would bury it mid-table
  on the day it matters most.

Cut from `scripts/review-findings.ts` at `5b180e0` by #531.

- **`review:findings` is a command.** A measurement nobody can repeat
  becomes folklore the moment the codebase moves. The table in
  `skills/self-review.md` carries the date it was last run, and running the
  command is how that list is kept honest.
- **HTTPS, not `gh`.** Spawning a binary found on `PATH` is a vulnerability
  Sonar flags and is right to: the command a script runs should not depend
  on what happens to be earlier in someone's path. `gh auth token` supplies
  the credential; nothing is stored.
- **`CLOSED_PAGES`.** Asking for exactly `count` closed pull requests could
  return `count` abandoned branches and no merges at all.
- **Paging the comments.** More than 100 on one pull request is not
  hypothetical: #270 had 18 from one reviewer alone, and a busy one carries
  replies too.
- **One `try`.** An earlier version guarded the listing and left the
  per-pull fetches outside, so a token expiring mid-run printed a stack
  trace and no table: the "failure path dropped" class the command exists to
  count.

## Moved from comments, 2026-10-08

Cut from `tests/unit/scripts/review-findings-plan.test.ts` at `a15a9f9` by #531.

- **Two corrections from review of the first version.** It matched on bare
  keywords and took the first hit, which filed a parser finding under tests.
  And it used `gh pr list` unsorted: #250 was created long before #291 and
  merged after it, so the API's own order counted the wrong window. It also
  printed internal class names, which disagreed with `skills/self-review.md`.
