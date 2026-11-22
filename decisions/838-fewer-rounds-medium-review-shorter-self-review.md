# 838 — Fewer Sourcery rounds, a medium code review before a feature pull request, a shorter self-review: decisions

Chore #838, from Miikka's decisions on #817, each backed by the measurement over the last 50 merged pull requests (#689 to #835, to 2026-11-21).

| Decision | Why |
|---|---|
| **From the third on, a full Sourcery review only when the one before it found a behaviour defect**; a behaviour defect is always fixed, and every other finding from round 2 on gets an answer on its thread, with no push (`skills/open-pr.md`, "e2e and Sourcery rounds") | 32 rounds after the second ran on 20 pull requests. Their behaviour defects came on #772 and #689 only, and both had one in round 2 as well. The rule would have skipped 15 rounds on 10 pull requests, losing 6 test findings, 3 prose findings and no behaviour defect |
| **Before a feature pull request opens, the `code-review` skill runs once at medium effort**; chores and bugs keep the low run, and later pushes stay as they are. Overrides `decisions/559-sourcery-review-kind.md` where the skill always runs at its lowest effort | The skill found 10 behaviour defects, the most after Sourcery's 78, and 6 of the 10 came from runs longer than its low effort |
| **`skills/self-review.md` keeps classes 1 to 5, with the measured counts**; the six others leave the pass. Overrides the class lists of `decisions/290-review-finding-classes.md` and `decisions/390-review-classes-remeasured.md` | The pass found 2 defects in about 30 visible runs, while Sourcery caught 89 findings in its classes. Classes 1 to 5 held 79 of them (tests 34, prose 23, transactions 10, failure paths 8, normalisations 4, the last by difference); the other six held 10, and English reaching a Finnish UI none |
| **The pass's e2e step points at the hooks and the strategy**, and its step for failures no longer asks for a logged line, which was the removed eleventh class | So the pass agrees with `decisions/837-e2e-before-a-pull-request-and-a-review.md` and with the classes it keeps |

Not done: handing "a test that proves nothing" to mutation testing, which #805's trial decides; the e2e changes, which were #837; and Sourcery's or Sonar's configuration. `npm run review:findings` still sorts findings into all eleven classes, so a removed class that comes back shows up when the table is re-measured.
