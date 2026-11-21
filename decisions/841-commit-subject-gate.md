# 841 — Commit subjects say what changed: decisions

Chore #841. Two commits on #840 and one on #807's branch were titled "answer Sourcery's first/second review". A subject like that names the review and says nothing about the change. The rule was a note, and the note did not hold. Now a git `commit-msg` hook refuses such a subject, and CI's `Commit messages` job, a required check, refuses a pull request that carries one.

| Decision | Why |
|---|---|
| **What is refused:** six phrase shapes, each naming the review itself. They are "answer/address/respond to/reply to" with the review within three words in the same clause, "fix review/Sourcery's/Sonar findings", "fix findings from … review", "apply … suggestions", "review round" and "per … review" | A shape needs both the act and the review in it. So `chore: check:sourcery says which kind of Sourcery review a head has` and `fix: a table TASO serves as unplayed is answered with our own` pass: they name a change that is about reviews or answers. Requiring the same clause keeps `answers come from the cache, and the comments table is dropped` a change |
| **Tested against every subject on `main`** (611 when written, kept in `tests/unit/scripts/hooks/main-subjects.txt`): all pass except six from before squash merges, which must fail | `main` is the record of what the project accepts as a subject, so a rule that refused one of those would be wrong. The six (`refactor: address Sourcery review on PR #120` and five like it) are the same mistake, so the test proves the rule catches the real thing |
| **Where it runs:** the `commit-msg` hook on the subject being committed, and the CI job on every commit `base..head` adds and on the pull request's title. The job is limited to the actors the other jobs are, like every job that runs pull-request code | The hook stops it as the commit is made, for anyone with the hooks installed. The job covers `--no-verify` and commits made elsewhere, and as a required check it blocks the merge. The title matters because a squash merge makes it the subject that lands on `main`. It is checked when the pull request opens or is pushed to; a title edited later is not rechecked until the next push |
| **Only the subject is read** | The subject is what `git log --oneline` and a review list show. A body may explain which review a fix answered |
| **Not a `verify` stage:** `check:commits` is in `NOT_A_STAGE` | The hook has already checked each commit as it was made, so a local stage would repeat it |
| **A range git cannot read fails the job** | An unread range is not a pass, the same as `check:boxes` (decisions/463) |

- **The required check is set before the merge.** The docs list it as required, so it is true when they land. Until the job is on `main`, a pull request without it waits, as it would for being behind `main`.

Not done: a full message format (commitlint, conventional types); rewriting the subjects already on #840's and #807's branches, which the squash merges replaced; running the checker from the base revision so a pull request cannot change it, which is true of every CI job here; and a non-default `core.commentChar`, which nobody here sets.
