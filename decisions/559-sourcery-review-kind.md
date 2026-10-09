# 559 — Which kind of Sourcery review a head has: decisions

Chore #559. Two documents said a push after the first review "creates no new
review object". It does, and on 2026-10-05 that object was read as an approval
three times.

## What was observed

Measured on the reviews API on 2026-10-05 and again on 2026-10-09. The earlier
claim came from Sourcery's support on 2026-08-22; why the behaviour differs
now is not known, and nothing here depends on the reason.

| Sourcery wrote | State | `commit_id` | Body | Check-run at that commit |
|---|---|---|---|---|
| A full review | `COMMENTED` or `APPROVED` | the commit reviewed | starts `Hey - I've found N issues` or `Hey - I've reviewed your changes and they look great!` | `success` |
| The quick check after a push | `APPROVED` | the new head | only `### Sourcery assessment` and `**Approved.**` | `success` |
| A budget notice | `COMMENTED` | the head | starts `Sorry @…, this account has used its review budget of 1,500,000 diff characters for the last 7 days.` | `skipped`, with the same sentence as its summary |
| A skip for another reason | no review, or `COMMENTED` | the head | absent, or starts `Sorry, we are unable to review this pull request` | `skipped`, the summary naming the limit; not read for the second shape |
| Nothing | no review | | | `success`, or none |

Seen as: full reviews on #556 `7f39f49` and, by the issue's own measurement,
#553 `eb6c786`, #554 `766dd69` and #555 `3404b15`; quick checks on #552 `f4e9a2d`, #557 `09874a2`, #558 `304d479`; the
budget notice on #558 `3890507`; a skip on #541 `9bd3386` (five automatic
re-reviews) and, as a review, on #394 `6d3a66c` (a diff over 20 000 lines);
nothing, beside a green check-run, on #558 `c67b89c` and #594
`1a3232d`.

A state of `DISMISSED` is what a later push does to an earlier review, and
says nothing about which kind it was. A review with an empty body is a reply
in a thread.

## The first line of the body is the test

Nothing else tells a full review from the quick check: a full review that
found nothing is `APPROVED` too, and the `commit_id` and the check-run are the
same for both. So the script reads the
body, and a body in no known shape on the head is an error with its
first line quoted, never a guess. Sourcery can change its wording, and a
script that then stops is better than one that calls an unknown body a review
or calls it nothing.

## A script, because the sentence was already there

`skills/open-pr.md` step 9 already said a light re-check is not a full review.
What nobody could do from it was tell which one a head had. `npm run
check:sourcery -- <PR>` answers that and exits non-zero when the answer is not
enough, in place of the `gh` snippets step 7 used to carry.

It is run by hand, and is not a CI job or a required check. Out of scope by the
issue: GitHub accepts `skipped` for a required check
(`docs/setup/011-branch-protection.md`), and a job that fails until Sourcery
has answered would be red on every push.

## When the quick check is enough

Only for comments and documentation changed since the last full review. #557
is the case: one commit after the full review reworded a comment.

| A changed file is | When |
|---|---|
| documentation | its path ends `.md`, and so did the path it was renamed from, if any |
| comments only | TypeScript source modified in place, whose two sides parse to the same code and carry the same directives |
| anything else | every other file; every file under a `tests/` directory or named `.test.` or `.spec.`, Markdown included; a file renamed from one; and a file GitHub will not send whole |

"The same code" is the TypeScript compiler's parse of each side, printed back
without comments, and the two compared. The script reads the whole file at the
reviewed commit and at the head for that, and only for files that could
qualify. A directive is a comment a tool reads: `@ts-expect-error`, a linter,
formatter or coverage instruction, `NOSONAR`, `@vitest-environment`, a
triple-slash reference. Each is compared together with the line under it, so
one that is added, removed, reworded or moved counts as a change.

The first version judged a diff's changed lines by how they start. That reads
a multiplication carried onto a line beginning `* `, and a `//` line inside a
template string or between JSX tags, as comments. Sourcery's review found it,
and patching the prefixes would have left the next case to be found the same
way.

## A rebase since the full review

`main` requires a branch to be up to date, so a branch is often rebased after
its full review. The reviewed commit is then no ancestor of the head, and the
commits in between include the base branch's. The script compares the pull
request with itself in that case: its own diff at the reviewed commit against
its own diff at the head, file by file. A file whose part is the same on both
sides did not change; one that differs counts as changed, as documentation or
as anything else, since no patch of the difference exists to read for
comments. A rebase that moves a hunk's line numbers makes the two differ, and
that errs towards asking for a review. A file's earlier path is part of what
is compared, so a rename counts.

GitHub lists at most 300 files of a comparison and does not say when it stops.
A list that long is treated as incomplete: the quick check is then not
enough, and neither is the exemption for unreviewable paths.

## Nothing, beside a green check-run, stays a block

Some pushes get a `success` check-run and no review object at all. That may be
the quick check with nothing to say; it was not established. The script
lists what changed since the last full review for such a head, and exits
non-zero whatever the list holds. Letting documentation through here as under
the quick check is a rule nobody has agreed, so it is left as a question for
the pull request.

When a commit is named in place of the head and Sourcery wrote nothing about
it, every full review on the pull request is a candidate for "the last one",
including one written later. For a head Sourcery did write about, only earlier
reviews count.

## A dismissed review, and a head that moves

A push dismisses the reviews of the commit before it, so `DISMISSED` on an
earlier commit says nothing: #557's full review of `5bee97a` is in that state.
On the present head it can only be a person's doing, and a full review they
dismissed is not counted. A named earlier commit keeps its dismissed reviews,
or #558 at `304d479` could not be read as it stood.

The script reads the head first and the reviews after, so a push in between
would leave it reporting on the commit before. It reads the head again at the
end and refuses to answer when the two differ.

## A named commit is looked up, not sent

The optional commit is matched against the commits GitHub lists for the pull
request and the ones Sourcery reviewed, and the whole id found there is what
goes into a request. A commit rebased away that Sourcery never reviewed cannot
be named. What was typed therefore never reaches a URL, which is also what
Sonar's gate failed the first push for (`tssecurity:S8476`,
`tssecurity:S7044`): a hex pattern is not a sanitiser to its taint analysis.
Abbreviations are resolved once, so every later comparison is of whole ids.

## What the two checks share

`scripts/github-read.ts` holds the reader, the paging and the turning of a
verdict into output and an exit code, for this check and `check:boxes`. The
first push copied the last twenty lines of `scripts/issue-boxes-steps.ts`, and
Sonar counted them. Reviews, commits and check-runs are all read page by page.

## The unreviewable paths moved into the script

`package.json` and `package-lock.json` were a fenced list in `skills/open-pr.md`
beside a `git diff --name-only` to check by eye. They are `UNREVIEWABLE` in
`scripts/sourcery-review-plan.ts` now, and the script reads the pull request's
paths itself when the review is not enough. `tests/unit/docs/sourcery-gate.test.ts`
holds the skill to the script: the five outcomes by name, the two paths, and no
document saying a push leaves no review object.

## The author's review comes first, and has a box

Added to the issue on 2026-10-09. #591 and #593 were pushed with tests and
mutation checks but without the pass in `skills/self-review.md`, which
`CLAUDE.md` step 6 already required. Sourcery was the first reader; three
rounds on #593 found a security rule ignored for whole workflow files and a
failure swallowed silently, and the seven-day budget ran out that evening.

The rule was written down and skipped, which is how the quick check was
misread too. So `skills/open-pr.md` step 5 puts the pass and the `code-review`
skill before the first push, the skill at its lowest effort because the
author's review is the quick one and Sourcery's the thorough one (Miikka,
2026-10-09), and the pull request template has a Checklist box
that stays visibly empty until both were run on the diff as pushed, with what
they changed written on the line. `npm run check:boxes` reads the issue's
boxes and not the pull request's own; making it read this one is a separate
change.

## What the first push got wrong

Sourcery's first review found nine things and Sonar's gate failed, after the
author's own pass and a `code-review` run. The comment detection was the
largest: three reviews in a row found a new way to fool a rule about how a
line starts, and the answer was to stop reading prefixes. The rest were a
dismissed review counted, a head that could move, a rename read as
documentation, Markdown under `tests/` read as documentation, one page of
check-runs, and three sentences in the documents that disagreed with the
script.

## Not done

- #552 and #557 stay as merged (decided 2026-10-05).
- No change to Sourcery's configuration or plan.
