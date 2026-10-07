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

## The eighth batch, 2026-10-06

Nineteen files in full: in `src/lib`, `admin-user-view.ts`, `admin-users.ts`,
`competition-preferences.ts`, `current-user.ts`, `elo.ts`, `goals-per-game.ts`,
`outcome-shares.ts`, `prediction-quality.ts`, `sign-in-allowlist.ts` and
`team-page-context.ts`; in `src/components`, `competition-analytics.tsx`,
`match-list-table.tsx`, `national-team-page.tsx`, `standings-table.tsx` and
`team-matches-outcome.tsx`; `src/app/admin/page.tsx`,
`src/app/settings/page.tsx`, `src/db/index.ts` and
`src/instrumentation-client.ts`. 37 182 characters of comment became 25 906,
measured after the fixes the reviews of the sixth and seventh batches brought.

Four records are new: `140` (Sentry's production configuration), `169` (the
one-shot production backfill), `498` (a match list prints the score as the
match page does) and `536` (a missing `DATABASE_URL` fails by name).

From this batch on, a comment that needs no judgement is rewritten by a
script and not by hand. The script is a local one-off of this chore's and is
not in the repository; what it does is all of this: a doc comment of three
lines or fewer whose only fault is a bare citation in parentheses, `(S4)` or
`(specs/053 S2)`, loses the citation, and on a declaration gains the path of
the record its last writer belongs to. 73 of this batch's comments went that
way. Everything longer, and every citation that is part of a sentence, is
still read and rewritten.

## The ninth batch, 2026-10-06

Forty files in full: in `src/lib`, `admin-role.ts`, `analytics-axis.ts`,
`avatar-limits.ts`, `breadcrumb.ts`, `cup-standings.ts`, `e2e-analytics.ts`,
`goals-series.ts`, `home-baseline.ts`, `pacer.ts`, `prediction-backtest.ts`,
`prediction-log.ts`, `provider-ids.ts`, `refresh-actions.ts`, `regions.ts`,
`return-path.ts`, `seasons.ts`, `sentry-config.ts`, `settings-actions.ts`,
`streaks.ts`, `table-volatility.ts` and `test-database-name.ts`; in
`src/components`, `admin-user-table.tsx`, `charts/goals-chart.tsx`,
`charts/season-comparison-chart.tsx`, `competition-picker.tsx`,
`competition-team-page.tsx`, `favourites-page.tsx`, `match-prediction.tsx`,
`refresh-confirm.tsx`, `refresh-run-list.tsx`, `site-footer.tsx`,
`start-redirect.tsx`, `streak-records-section.tsx`,
`taso-season-only-controls.tsx` and `team-season-selector.tsx`; and
`src/app/admin/data/page.tsx`, `src/app/api/avatar/me/route.ts`,
`src/app/domestic/team/[id]/page.tsx`, `src/app/favorites/page.tsx` and
`src/instrumentation.ts`. 56 743 characters of comment became 40 271.

Four records are new: `302` (the privacy policy and the footer that reaches
it), `303` (the terms of service and the providers' credit), `479` (the
integration suite refuses a database that is not a test one) and `529` (one
parser for whole numbers in URLs).

The batch is twice the size of the earlier ones because its files are small: 89
of its comments needed only a citation cut and a record path, and the local
script wrote those. From the review of the eighth batch, each batch is also
checked for a comment line over 100 columns, a code span split across lines, a
record path on a comment it does not belong to, and a new record's issue kind
against the issue's label.

## The tenth batch, 2026-10-06

The last 76 files of `src/` that broke the rule: 22 pages and routes under
`src/app`, 35 components, `src/db/connection-string.ts` and
`src/db/migrate.ts`, and 17 modules in `src/lib`. 42 224 characters of comment
became 31 244, measured after the hand review's fixes. With this batch no file
under `src/` has a comment over three lines, a doc comment on a declaration
without a record path, a spec or issue citation, or a doc comment on a
statement inside a function.

Five records are new: `179` (the loading state names no table), `182` (the
national team pages are never prerendered), `416` (the team page's folds),
`489` (links repeated per data row are not prefetched) and `533` (the
not-found and error pages are in Finnish).

Two pages gained a doc comment so that a cut citation's record has a
declaration to sit on: `Domestic`, the `/kotimaa` picker, and the front page's
`REGIONS`. From the review of the ninth batch, a record path goes on the
comment of the function a reason was cut from, and a measurement left in a
comment the script only touched is moved with the others.

## The eleventh batch, 2026-10-07

Everything outside `src/` and `tests/`, in one batch at Miikka's word
(2026-10-07), so that it is verified and reviewed once: all 46 files of
`scripts/`, the six TypeScript configuration files at the root and in
`.railway/`, and ten configuration files that are not TypeScript. In
`scripts/`, 142 475 characters of comment became 80 439; in the TypeScript
configuration files, 21 486 became 10 521; in the others, 474 comment lines
became 202.

Almost none of this code came from a feature, so almost none of it had a
record. 29 are new, one for each chore or bug whose comments held its reasons:
`084`, `217`, `220`, `227`, `230`, `242`, `290`, `292`, `293`, `357`, `361`,
`371`, `376`, `384`, `385`, `390`, `399`, `400`, `401`, `403`, `404`, `406`,
`463`, `467`, `471`, `521`, `525`, `527` and `551`. `376`, `385` and `471` are
numbered by their pull request, the one number a chore without an issue has.

The files that are not TypeScript are done differently, also at Miikka's word:
`sonar-project.properties`, the four workflows, `.env.example`,
`docker-compose.yml`, `.gitignore` and the two hooks. Their long comments were
written a paragraph at a time by many small changes, so each is cut to what a
reader of the file needs, a constraint the file cannot show included, and moved
whole, as written, to one record, `decisions/531-configuration-files.md`, which
the file's first line cites. `scripts/comment-rules.ts` reads TypeScript only,
so nothing checks these files' comments. The comment above
`sonar.coverage.exclusions` keeps its four `exclusion-count` lines, which
`tests/unit/scripts/coverage-exclusions.test.ts` reads; its prose moved like
the rest.

Two records created by earlier batches were misnamed and are renamed here, with
their citations. `132-carry-over-config-validation.md` was numbered by its pull
request, which closes #127, and is `127-carry-over-config-validation.md`.
`085-running-commit-at-health.md` was named for one commit of #85, whose
subject is the release workflow, and is `085-release-workflow.md`. A commit
subject's single `(#N)` is often the pull request, so each new record's number
is checked against the issue the pull request closes.
Renaming a record is an exception to "added, not edited"; Miikka approved these
two on 2026-10-07, as corrections of a wrong name.

Usage lines stay where they fit in three lines (`review-findings.ts`,
`release-pr.ts`, `backfill.ts`, `grant-admin.ts`, `issue-boxes.ts`,
`predictions.ts`); the six modes of `release-version.ts` do not fit, and are in
record 085.

## The twelfth batch, 2026-10-07: the first of the tests

A small batch, to settle how tests are done before the other 216 files: the 17
files of `tests/integration` and the five shared modules under `tests/support`
and `tests/shared`. 38 288 characters of comment became 25 698.

**How a test file is done**, as agreed with Miikka on 2026-10-06 and
2026-10-07, and corrected by the hand review of this batch. It differs from
`src/` in four ways.

- **The header carries the record paths, once.** It sits after the imports with a
  blank line under it, so it is the file's and not the first constant's. It says
  what the file tests and cites the record of the feature the tests were first
  written for, then the records of any later change that added tests. A helper
  inside the file takes a line comment and no path of its own.
- **A test's name says what it protects.** A comment stays, in one to three
  lines, where the body cannot show something, and what stays is the reason: why
  a fixture has this value, why two calls start before either is awaited, why the
  assertion is on one thing and not another. A comment that says only what the
  code does is the one to cut.
- **Only history leaves the file**: what broke, which review found it, what the
  earlier version did.
- **The record is read first.** Tests were mostly written with the fix they
  prove, and its record usually tells the story already. History goes to the
  record only where the record lacks it; otherwise it is simply cut. The first
  version of this batch moved every story, and ten of the sixteen records it
  appended to had said the same thing before.

The five shared modules, which are not tests, are done as `src/` is, with a
path on each declaration.

Issue and spec citations inside a test's name, `it("… (#528)")`, are left: a
name is a string in the code, and this chore changes comments only.

## The thirteenth batch, 2026-10-07: the end-to-end tests

49 of the 52 TypeScript files under `tests/e2e`: 46 specs, `session.ts`,
`global-setup.ts` and the seeded fixture. 51 736 characters of comment became
41 257. `dark-mode.spec.ts`, `mens-team.spec.ts` and `womens-team.spec.ts`
wait for the next batch, because with them the diff passed 150 000 characters.

Done the way the twelfth batch settled, with three things specific to these
files.

- **Ten specs had no header at all.** Each has one now, a line or two saying
  which page it drives, with the record of the feature the file was first
  written for and of each later change that added tests to it.
- **A header also cites the record of a spec a cut comment named**, so a
  reader of `comebacks.spec.ts` still finds the half-time coverage rule the
  comment used to point at.
- **A helper's doc comment became a line comment**, and so did a doc comment
  on a `test(...)` or a `test.describe(...)`, which is a statement and not a
  declaration. The three modules that are not tests keep doc comments, with a
  path on each declaration.

Three changes had no record and have one now, for the reasons their tests'
comments carried: #170 (what the tab-title specs pin, and the measurements
behind it), #178 (why the cup page is measured only after its rounds arrive)
and #441 (the sizes the axis-text spec expects). Seven existing records took an
entry: 024, 027, 043, 189, 207, 269 and 413. Before each entry the record was
searched for the story, and stories were cut without an entry where one of
nineteen records tells them already: 020, 021, 023, 024, 026, 028, 030, 041,
043, 045, 046, 133, 189, 266, 269, 304, 424, 527 and 529.

Four citations were cut with nothing moved, because all they said was the
issue's own title: #256 in `domestic-team.spec.ts`, #485 in
`bogey-teams.spec.ts` and `national-team-analytics.spec.ts`, #501 in
`table-volatility.spec.ts` and #526 in `favourites.spec.ts`. The reason beside
each stays in its comment.

## The fourteenth batch, 2026-10-07: the pages' unit tests

The 34 test files under `tests/unit/app`, and the three end-to-end specs the
thirteenth batch held back: `dark-mode.spec.ts`, `mens-team.spec.ts` and
`womens-team.spec.ts`. 57 295 characters of comment became 46 450.

Every file has a header now; none of the 34 had a record path before. Its
record list is read off the file's history: the record of the change that
created the file, then by number the record of each later change that added
a test under a new name, of any change whose spec or issue a cut comment
named, and of any record that took an entry from the file. A file git shows
as copied from another counts as created by the change that copied it, so
`womens-team.test.tsx` begins with 018 and not with the record of the men's
page it was copied from. A change that only renamed a test, or only wrote a
comment, is not listed. For the two club pages the list is long, because
every Analyysit panel added a test to them.

Three comments stood in several files word for word and are one sentence
now, the same in each: the favourite star's `useSession` (seven files, one of
which signs in and says so), the mocked season discovery, and the reason a
route file has a test of its own (five files). The Analyysit marker's comment
is shortened the same way, in the wording each page needs. The stories behind
the first and the last are in 026 and 385 already.

Two changes had no record and have one now: #264 (how
`rendering-mode.test.ts` decides a page is static, and what its three checks
each prove) and #299 (why two page tests arrange their mocks at file level).
Seven existing records took entries, 269 two of them: 041, 113, 182, 269,
303, 403 and 529. Stories were cut without an entry where their record tells
them already: 020, 026, 042, 179, 182, 385 and 533.
