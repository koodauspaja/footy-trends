# 531 — Comments say what the code is for: decisions

Chore #531, decided by Miikka on 2026-10-05. Comments were 42% of `src/`, read by
nobody but the coding agent, and every line of them spends Sourcery's diff
budget. What the agent needs beside the code is short; the rest is looked up
here.

## A comment says what a thing is for

One to three lines about the thing itself, or a constraint the code cannot show.
Then the decisions behind it, as paths: the original feature's first, then the
later ones (bugs, chores, other features), oldest first. A spec is not cited
beside them: its decision record shares its number and leads to it.

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

## What the first batch corrected

History of this change, kept here and not in the records the reasons went to:

- **Doc comments on the wrong declaration,** each moved onto its own:
  `resolveTasoSeasonContext`'s on `resolveTasoSeasonCeiling`,
  `publishedPosition`'s on `UNRANKED`, `teamLeagueMatches`' on `teamCupMatches`,
  `isDomesticLeague`'s on `seasonsBeside` (and `isLeagueCompetition`'s likewise
  in `standings-service.ts`), `nationalTeamPathFor`'s on `idRouteFor`.
- **Stale copies, deleted:** `buildRound`'s doc comment on `pairLegs`, one left
  on `dedupedGroupTeams` from the per-source diff functions `compare` replaced,
  and two above `TasoTeamStanding` attached to nothing.
- **Two comments on one thing, merged:** `classifySeasonGroups`,
  `resolveTeamNames`.
- **Names of deleted functions:** `getCachedSeasonGroups` (in a comment that
  also said `taso.ts` does no caching, which it does), `resolveCurrentTasoSeason`,
  and `isPlayoffGroup`, which is `keepsATable` now.
- **Statements the code contradicted:** "league seasons only" on both
  `getTeamSeasonComparison` functions, with `otherLeagueSeasons` named as the
  rule's home; and "only one Finnish competition" on `TasoStandingsControls`.

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
  a declaration (a function, a type, a constant) or on the file's header
  comment. A field's comment and a comment inside a function need none: they
  are covered by the declaration they sit in, or by the file's header where the
  declaration has no comment of its own.

## The check

`tests/unit/scripts/comment-rules.test.ts`, in `npm run test:unit`, reads every
comment of every file git tracks or would, through the TypeScript parser, so a
`//` in a string, in JSX text or inside a doc comment's own text is not one. It
fails when:

| Rule | Why |
|---|---|
| A cited `decisions/…md` does not exist | a link to nowhere is a stale comment again |
| A comment line cites an issue or pull request number and is not in the record, or a recorded one is gone | the record, `tests/unit/scripts/recorded-issue-citations.json`, holds a key per citing line, a hash of its file and text. A new line is named; a removed one must leave the record, so it only shrinks. A count was tried first and let a swap through: one citation out, another in |
| A doc comment starts on the line after another ends | the upper one describes something else, or the same thing twice |

Doc comments over twelve lines are reported, never failed on. A doc comment, a
blank line and another is a file header, and passes only when it is the file's
first doc comment and sits above the first declaration: imports and a
`"use server"` line may come before it. A second one up there is what a deleted
declaration leaves behind, and further down a blank line excuses nothing.

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
blank line now marks it as the file header it is. Hand review found one that
was neither: a comment in `rendering-mode.test.ts`, 150 lines into the file,
about a `describe` 200 lines below it. It moved onto that `describe`, and the
header exemption was narrowed to a file's first doc comment so the next one
fails. Two notes that describe a stretch of a test file and no declaration,
in `settings.spec.ts` and `executable.test.ts`, became plain `/*` comments.

These moved comments still tell history and cite issues: they were moved word
for word, not rewritten, and are trimmed with the batch their file belongs to.

## The second batch, 2026-10-06

`taso.ts` and `taso-standings-service.ts` in full: 292 comments became 165, and
58 300 characters of comment became 27 100. Every doc comment on a declaration
is one to three lines and lists its records, each file has a header comment, and
neither cites a spec or an issue.

The reasons went to 24 records by `git blame`. Seven are new, for bugs and
chores that had none: `132`, `196`, `200`, `272`, `281`, `284` and `363`. Each
entry names `a86c1cb`, the commit on `main` both files were cut from, so
`git show a86c1cb:<path>` gives the original comment.

## The third batch, 2026-10-06

Seven files in full: `src/db/schema.ts`, and in `src/lib` `auth.ts`,
`cup-rounds.ts`, `head-to-head.ts`, `match-service.ts`, `rate-limit-storage.ts`
and `season-comparison.ts`. 64 700 characters of comment became 32 000.

The reasons went to 31 records by `git blame`, three of them new: `314`, `492`
and `528`. The checks the hand review of the second batch added were run before
this one opened: the code cites every record a reason of its went to, each
declaration cites the feature that first added it, every function an entry
names exists, and no doc comment sits on a statement inside a function body.

## The fourth batch, 2026-10-06

Ten files in full: in `src/lib`, `cup-stages.ts`, `domestic-competitions.ts`,
`football-data.ts`, `forwarding.ts`, `national-team.ts` and
`national-team-analytics.ts`; in `src/components`, `auth-controls.tsx`,
`head-to-head-page.tsx`, `settings-page.tsx` and `charts/line-chart.tsx`.
58 450 characters of comment became 34 873.

Three records are new, for two bugs and a chore that had none: `266`, `271` and
`413`. One comment sat on the wrong declaration: the description of the
competition list was on `DEFAULT_DOMESTIC_COMPETITION_CODE`, the constant above
it, and moved onto `DOMESTIC_COMPETITIONS`.

## The fifth batch, 2026-10-06

Twelve files in full: in `src/lib`, `competitions.ts`, `match-detail.ts`,
`position-series.ts`, `refresh-view.ts`, `streak-records.ts`, `team-search.ts`,
`team-seasons.ts` and what was left of `standings-service.ts`; in
`src/components`, `account-menu.tsx`, `favourite-toggle.tsx`, `match-page.tsx`
and `team-page.tsx`. 49 585 characters of comment became 30 495.

One record is new, `269`, for the chore that gave every colour a role that
follows the theme. Two comments sat on the wrong declaration, as one did in the
fourth batch: the description of the competition list was on
`DEFAULT_COMPETITION_CODE`, and the team page's own description on its
`TEAM_HEADING` constant. Each moved to what it describes.

## The sixth batch, 2026-10-06

Seventeen files in full: in `src/lib`, `avatar.ts`, `avatar-image.ts`,
`country-names.ts`, `meeting-labels.ts`, `national-team-service.ts`,
`preferences.ts`, `provider-request.ts`, `refresh-diff.ts`, `refresh-runs.ts`,
`session-extras.ts` and `standings.ts`; in `src/components`,
`analytics-section.tsx`, `refresh-form.tsx`, `team-search.tsx` and
`charts/bar-chart.tsx`; in `src/app`, `api/health/route.ts` and
`domestic/standings/page.tsx`. 50 989 characters of comment became 26 906.

Seven records are new, each for a change that had none: `085` (the health
endpoint reports the running commit), `113` (the TASO key is monitored), `197`
(a rate limit is waited out), `373` (the team search's own header row), `419`
(one fold marker), `424` (the `Analyysit` groups) and `495` (analytics read the
score after extra time).

Two files gained a comment so that record paths have a declaration to sit on:
the health route a header, and `DomesticStandingsPage` a doc comment. Doc
comments on statements inside `RefreshForm`, `TeamSearch` and the health
route's `GET` became line comments, which is what the rule asks of a comment
inside a function.

## The seventh batch, 2026-10-06

Eighteen files. Fifteen in full: in `src/lib`, `admin-guard.ts`,
`comebacks.ts`, `domestic-page-context.ts`, `favourite-keys.ts`,
`form-series.ts`, `page-context.ts`, `prediction-log-service.ts`,
`team-context.ts`, `team-panels.ts`, `user-agent.ts` and `viewer.ts`; in
`src/components`, `comebacks-section.tsx`, `cup-bracket.tsx`, `data-table.tsx`
and `site-header.tsx`. Three were trimmed in the first batch and had what the
check written since then finds: `favourites.ts`, `force-refresh.ts` and
`cup-bracket.ts` in `src/lib` gain record paths on eight doc comments,
seven of them one-liners that had none, and four doc comments on statements
become line comments. 49 273 characters of comment became 37 240, measured
after the hand review's fixes; the three finished files grow by the paths
they gained.

One record is new, `207`, for the chore that gave the site header its region
breadcrumb.

After the review of the fifth batch, each batch is also swept for three things
before it opens: history wording left in a short comment, a parameter the old
comment explained and the new one no longer names, and a rule whose reach
shrank in the rewrite.
