# 559 — The quick check is not a full review, and the author's review comes first: decisions

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
| A refusal | `COMMENTED` | the head | starts `Sorry, we are unable to review this pull request` | `skipped` |
| A skip for another reason | no review | | | `skipped`, the summary naming the limit |
| Nothing | no review | | | `success`, or none |

Seen as: full reviews on #556 `7f39f49` and, by the issue's own measurement,
#553 `eb6c786`, #554 `766dd69` and #555 `3404b15`; quick checks on #552
`f4e9a2d`, #557 `09874a2`, #558 `304d479`; the budget notice on #558
`3890507`; a refusal on #394 `6d3a66c` (a diff over 20 000 lines); a skip on
#541 (five automatic re-reviews); nothing, beside a green check-run, on #558
`c67b89c` and #594 `1a3232d`.

A state of `DISMISSED` is what a later push does to an earlier review, and
says nothing about which kind it was. A review with an empty body is a reply
in a thread.

## The first line of the body is the test

Nothing else tells a full review from the quick check: a full review that
found nothing is `APPROVED` too, and the `commit_id` and the check-run are the
same for both. `skills/open-pr.md` step 7 reads that line with a `gh` query
and a table of what each first line means, and the paragraph that told the
reader not to compare `commit_id` with the head is gone, since it rested on
the wrong claim.

## When the quick check is enough

For a fix that changes no code and no test: comments and documentation, as the
issue says. A person judges that from the changed files. #557 is the case: one
commit after the full review reworded a comment.

## The script is its own issue

The issue's larger half was `npm run check:sourcery`, to make step 7 a command
with an exit code. It was built in this pull request and taken out again, and
is #597 now.

It grew past the issue. Beyond the five outcomes it judged whether only
comments had changed, compared a rebased branch with itself, looked a named
commit up, and held the list of unreviewable paths. Sourcery's first review
found nine things in it and its second, of the rework, seven more, nearly all
in those additions; Sonar's gate failed twice. A gate that decides what may
skip review is the kind of code a reviewer can always find one more case in,
and each addition was more of it.

What it taught, kept for #597:

- Telling a comment from code by how a line starts is unsound (a
  multiplication carried onto a `* ` line, a `//` line in a template string),
  and parsing the file and listing the comments tools read is a list that is
  never complete. #597 does not try: documentation only.
- Sonar's two findings (`tssecurity:S7044`, `tssecurity:S8476`) were about a
  commit id from one GitHub answer entering the path of the next request.
  Its data-flow is in `api/issues/search` with `additionalFields=_all`. The
  first fix answered a guess, the commit typed on the command line, and
  failed the gate again.
- The working version is in #596's history at `f85f418`.

The observation that a quick check exists does not need the script, so the
documents land here without it.

## The author's review comes first, and has a box

Added to the issue on 2026-10-09. #591 and #593 were pushed with tests and
mutation checks but without the pass in `skills/self-review.md`, which
`CLAUDE.md` step 6 already required. Sourcery was the first reader; three
rounds on #593 found a security rule ignored for whole workflow files and a
failure swallowed silently, and the seven-day budget ran out that evening.

The rule was written down and skipped, which is how the quick check was
misread too. So `skills/open-pr.md` step 5 puts the pass and the `code-review`
skill before the first push, and the pull request template has a Checklist box
that stays visibly empty until both were run on the diff as pushed, with what
they changed written on the line. `npm run check:boxes` reads the issue's
boxes and not the pull request's own; making it read this one is a separate
change.

The skill runs at its lowest effort (Miikka, 2026-10-09): the author's review
is the quick pass for what an author should have seen, it should catch most of
what Sourcery would, and it should not spend the quota development needs. On
this pull request it ran once at medium and did not predict Sourcery, which
found nine things after it.

## One class added to the self-review pass

`skills/self-review.md` section 10, "a check that passes what it cannot
classify", is the class most of those sixteen findings share. It is written
from this pull request's reviews and is not in the measured table, which
counts merged pull requests; `npm run review:findings` will say whether it
recurs.

## Not done

- #552 and #557 stay as merged (decided 2026-10-05).
- No change to Sourcery's configuration or plan.
