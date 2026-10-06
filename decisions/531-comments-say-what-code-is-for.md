# 531 — Comments say what the code is for: decisions

Chore #531, decided by Miikka on 2026-10-05. Comments were 42% of `src/`, read by
nobody but the coding agent, and every line of them spends Sourcery's diff
budget. What the agent needs beside the code is short; the rest is looked up
here.

## A comment says what a thing is for

One to three lines about the thing itself, or a constraint the code cannot show.
Then the decisions behind it, as paths: the original feature's first, then the
later ones (bugs, chores, other features), oldest first.

```ts
/**
 * Turns a cup's knockout matches into ties, one row per pairing with the legs
 * aggregated.
 *
 * decisions/014-champions-league.md
 * decisions/015-finnish-cups.md
 */
```

The feature that built it, then a later feature that changed it. How code used
to work, which pull request found something and what a reviewer said are
history, which lives in `decisions/`; a comment cites no issue or pull request
number. A test's name says what it checks, and a comment stays only where the
arrangement is not obvious.

## Decision records are added, not edited

A later record says which earlier one it overrides, and the earlier one stays as
it was. A bug or a chore writes one whenever it changes something meaningful,
`decisions/NNN-short-name.md` with the issue number, as `174`, `304`, `309` and
`318` already are; one with nothing to explain writes none, and placeholder files
stay banned. This overrides "chores and bugs have neither, by design".

## Where a reason cut from a comment goes

Into the record of the change that last wrote the comment, found with
`git blame` at the commit the comment is cut at. Not into this record: a reason
belongs with the feature, bug or chore that had it (Miikka, 2026-10-05).

- A feature's commit carries its decision record, and the reason goes there.
- A bug or chore with no record gets one, `decisions/NNN-short-name.md` with its
  issue number, as `325` and `530` did.
- An existing record is not rewritten. The text is added at its end, under
  `## Moved from comments, <date>`, with the path and the commit it was cut at,
  so `git show <commit>:<path>` gives the original.
- The comment left behind links that record. The paths go on the doc comment of
  a declaration: a function, a type, a constant. A field's comment and a
  comment inside a function carry none, and are covered by the paths on the
  declaration they sit in.

## The check

`tests/unit/scripts/comment-rules.test.ts`, in `npm run test:unit`, reads every
comment through the TypeScript parser, so a `//` in a string or JSX text is not
one. It fails when:

| Rule | Why |
|---|---|
| A cited `decisions/…md` does not exist | a link to nowhere is a stale comment again |
| A comment line cites an issue or pull request number and is not in the record, or a recorded one is gone | the record, `tests/unit/scripts/recorded-issue-citations.json`, holds a key per citing line, a hash of its file and text. A new line is named; a removed one must leave the record, so it only shrinks. A count was tried first and let a swap through: one citation out, another in |
| A doc comment starts on the line after another ends | the upper one describes something else, or the same thing twice |

Doc comments over twelve lines are reported, never failed on. A doc comment, a
blank line and another is a file header above a declaration, and passes.

## The batches

At most 150 000 diff characters each, measured before the pull request opens:
Sourcery's seven-day budget is shared, and about 1 570 000 had been spent in the
window when this one was sized. The first batch is the files the original list
in #531 named. Two of them, `taso.ts` and `taso-standings-service.ts`, hold
62 000 characters of comments between them and would have taken the batch to
175 000, so here they get only the listed defects and, in the second, the
stacked doc comments. Their full trim is the next batch.

Nine files outside the batch had eleven stacked doc comments: `backfill-run.ts`,
`migration-name.ts`, `next-version.ts` and `services-plan.ts` in `scripts/`, and
five test files. Each comment moved, unchanged, onto what it describes, or a
blank line now marks it as the file header it is.
