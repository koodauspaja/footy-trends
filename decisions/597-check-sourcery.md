# 597 — A script says which kind of Sourcery review a head has: decisions

Chore #597, split out of #559. `decisions/559-sourcery-review-kind.md` has what
was observed about Sourcery's review objects and why the first line of the
body is the test; this record is about the script that reads it. Nothing in
that record is overridden.

## Five outcomes, and one case that passes without a full review

`npm run check:sourcery -- <PR>` reads the reviews and Sourcery's check-run at
the pull request's head.

| It reports | Exit code |
|---|---|
| a full review | 0 |
| the quick check only | 0 when nothing but documentation changed since the last full review, 1 otherwise |
| a budget notice, and no review | 1 |
| a skip, and no review | 1 |
| nothing from Sourcery | 1 |

Documentation is a path ending `.md` that is not under a `tests/` directory,
not named `.test.` or `.spec.`, and not renamed from anything. The rule names
what passes; everything else, known or not, fails.

## It does not tell a comment from code

`skills/open-pr.md` step 9 lets the quick check stand for a fix that changes
only comments, and #557 was merged that way. The script does not try to
recognise that. The first attempt, in #596, judged a diff's changed lines by
how they start, then parsed each side of the file and compared the code with a
list of the comments tools read; three reviews in a row found a way round each
version. So a comment-only fix exits 1 and lists the file, and step 9 leaves
it to the person handing off, who says so in the pull request.

## Where it cannot tell, it fails

| Case | What the script does |
|---|---|
| A review body of the head in none of the known shapes | stops with the body's first line quoted, even beside a full review |
| A full review of the head in state `DISMISSED` | not counted, and the report says one was dismissed. A push dismisses the reviews of the commit before it, so on the head it is a person's doing |
| The head is not ahead of the last fully reviewed commit: a rebase | the quick check is not enough. The files GitHub lists then include the base branch's, so none are listed |
| GitHub lists 300 files of the comparison, its limit | the list is treated as cut short, and the quick check is not enough |
| The head changes between the first read and the last | stops and asks to be run again |
| No review of the head, with a green check-run | "nothing", exit 1. Whether that is a quick check with nothing to say was not established |

A dismissed full review of an earlier commit still counts as the last full
review: that is the state every one of them is in after the next push.

`main` requires an up-to-date branch, so a rebase after the full review is
common, and it now costs a new full review. Comparing the pull request's own
diff before and after the rebase was built in #596 and left out here: it was
the second largest source of findings.

## What it does not do

- It does not apply the allowlist of unreviewable paths. A pull request of
  `package.json` and `package-lock.json` alone exits 1, and step 7's exception
  stays a thing a person establishes with `git diff --name-only`.
- It takes no commit argument. #558 as it stood at `304d479` is a recorded
  case in the tests.
- It is run by hand, and is not a CI job or a required check: GitHub accepts
  `skipped` for a required check (`docs/setup/011-branch-protection.md`), and
  a job that fails until Sourcery has answered would be red on every push.

## Commit ids are checked before they enter a path

The head and the last reviewed commit come out of one GitHub answer and go
into the path of the next request. Each is checked to be forty hex digits and
encoded at the one place it enters a path, and an answer that names anything
else stops the check. Sonar's gate failed #596 on exactly this
(`tssecurity:S7044`, `tssecurity:S8476`), and passed once it was done.

## What the two checks share

`scripts/github-read.ts` holds the reader, the paging and the turning of a
verdict into output and an exit code, for this check and `check:boxes`.
`scripts/issue-boxes-steps.ts` uses it in place of its own copies, which Sonar
would otherwise count as duplicated. Reviews and check-runs are read page by
page.

## The documents

`skills/open-pr.md` step 7 runs the script in place of the two `gh` queries,
and its table of outcomes is held to the script's wording by
`tests/unit/docs/sourcery-gate.test.ts`. Step 9 says the quick check is enough
for documentation alone, which is when the script exits 0, and that a
comment-only fix is a person's call. The chore and bug workflows name the
script.
