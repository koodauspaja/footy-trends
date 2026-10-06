# 390 — The review classes re-measured, and two added: decisions

Chore #390 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/review-findings-plan.ts` at `5b180e0` by #531.

- **The classes after re-measuring, 2026-09-14.** Two added, a read and a
  write that do not span one transaction and the same value compared under
  two normalisations, from the 35 of 64 findings that were landing in
  `unclassified`. `failure path dropped` was widened: it read as extinct at
  zero findings while three sat unclassified under wording its patterns did
  not have. Its label's second half had no pattern at all; the clearest
  instance, on #381, says a database failure is "returned as
  `reason: "provider"`, even though the provider has not failed". The
  ordering changed too: the 2026-09-08 ordering put tests first, and tests
  are now fourth.

Cut from `scripts/review-findings.ts` at `5b180e0` by #531.

- **A class at zero.** A prompt to look, not a licence to delete it. Two
  classes read as extinct and neither was: one had three findings in
  `unclassified` under wording its patterns did not cover, the other had its
  single instance reclassified into a better home.
