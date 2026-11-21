# 841 — Commit subjects say what changed: decisions

Chore #841. Two commits on #840 and one on #807's branch were titled "answer Sourcery's first/second review". A subject like that names the review and says nothing about the change. The rule was a note, and the note did not hold. Now a git `commit-msg` hook refuses such a subject, and CI's `Commit messages` job, a required check, refuses a pull request that carries one.

| Decision | Why |
|---|---|
| **What is refused:** five phrase shapes, each naming the review itself. They are "answer/address/respond to/reply to … review, comments, findings, feedback or suggestions", "fix review/Sourcery/Sonar findings", "apply … suggestions", "review round" and "per … review" | A shape needs both the act and the review in it. So `chore: check:sourcery says which kind of Sourcery review a head has` and `fix: a table TASO serves as unplayed is answered with our own` pass: they name a change that is about reviews or answers |
| **Tested against every subject on `main`** (611 when written, kept in `tests/unit/scripts/hooks/main-subjects.txt`): all pass except six from before squash merges, which must fail | `main` is the record of what the project accepts as a subject, so a rule that refused one of those would be wrong. The six (`refactor: address Sourcery review on PR #120` and five like it) are the same mistake, so the test proves the rule catches the real thing |
| **Where it runs:** the `commit-msg` hook on the subject being committed, and the CI job on every commit `base..head` adds | The hook stops it as the commit is made, for anyone with the hooks installed. The job covers `--no-verify` and commits made elsewhere, and as a required check it blocks the merge |
| **Only the subject is read** | The subject is what `git log --oneline` and a review list show. A body may explain which review a fix answered |
| **Not a `verify` stage:** `check:commits` is in `NOT_A_STAGE` | The hook has already checked each commit as it was made, so a local stage would repeat it |
| **A range git cannot read fails the job** | An unread range is not a pass, the same as `check:boxes` (decisions/463) |

Not done: a full message format (commitlint, conventional types), and rewriting the subjects already on #840's and #807's branches, which the squash merges replaced.
