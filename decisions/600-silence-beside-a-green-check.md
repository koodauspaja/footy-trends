# 600 — check:sourcery passes a documentation-only push Sourcery left no review on: decisions

Chore #600. It overrides one row of the table in
`decisions/597-check-sourcery.md`, "No review of the head, with a green
check-run: nothing, exit 1", and nothing else in that record.

## What was blocking

After a full review, a push that changes only documentation is meant to pass
on the quick check (`skills/open-pr.md` step 9). The script allowed that only
when Sourcery wrote the quick-check review. Often it writes nothing: the
check-run at the new head reads `success` and the reviews API has no entry for
the commit. Seen three times on 2026-10-09, on #558 `c67b89c`, #594 `1a3232d`
and #598 `265f000`. The script reported "nothing from Sourcery" and exited 1,
and the ways on were another full review of the whole pull request for a few
lines of Markdown, or a merge against the script. #598 was merged that way on
Miikka's instruction.

## The rule

"Nothing from Sourcery" exits 0 when all of these hold, and 1 otherwise:

| Condition | Why |
|---|---|
| Sourcery's check-run at the head concluded `success` | it says Sourcery processed the commit. No check-run, one still running, or any other conclusion does not |
| A full review exists of a commit the head is ahead of | a rebase since then cannot be listed, as under the quick check |
| Every file changed since that review is documentation, and the list is complete | the rule the script already has: a `.md` path outside tests, changed in place |
| No full review of the head was dismissed | a person said the head's review does not count, and silence does not outrank that |

The files are listed either way, so a failing report shows what stands in the
way.

## What it rests on

Whether a green check-run with no review is a quick check that had nothing to
say is still not established. The rule does not need it to be. It rests on a
narrower claim: the commit differs from a fully reviewed one by documentation
alone, which is what the quick check is already trusted with, and Sourcery's
run of it finished green.

## Left as it was

The quick check's own rule, what counts as documentation, and every case
`decisions/597-check-sourcery.md` lists as failing. A dismissed full review of
the head blocks silence here; under the quick check it is reported and does
not block, as before.
