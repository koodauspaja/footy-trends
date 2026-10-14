# 057 — Surprise index: decisions

Implementation notes for `specs/057-surprise-index.md` (#354). The spec says
what is shown; this says how, and where the implementation had to decide
something the spec did not.

This record overrides one line of `decisions/052-predictions-log.md` and
specs/052 S10: backtest rows are no longer written by hand only. The hourly
run writes the ones that are missing (S13, S19). The whole backtest by hand is
unchanged.

It also adds to `decisions/603-server-side-records.md`: the hourly run's
`Predictions run finished` line carries `backtested` beside `refreshed`,
`logged` and `failures`.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `surprise.ts`, pure: `surpriseOf` reads a result's probability, `seasonSurprises` ranks and cuts, `isFirstStoredSeason` is S9 | As specs/054: every rule is unit-tested without a database, and `surprise-service.ts` only reads. |
| A draw | `surpriseOf` answers `null`, so a draw is neither ranked nor given a line | S18. One function decides for the list and for the match page. |
| A season's states | `ok`, `first-season`, `empty`, `all-drawn`, `error` | One per line of the spec's string table, so the panel never infers a state from an empty list. |
| `Kausi … (kesken)` without a list | Shown above the no-matches line and the all-drawn line too, so `empty` and `all-drawn` carry `inProgress` | S16 puts the line under the heading on the season in progress, whatever follows it. Not above the first-season line or the failure line, which say why nothing about the season is shown. |
| The first stored season | `getFirstStoredSeason` in `match-service.ts`, from the reads goals per game already makes; the season is answered before any prediction is read | S9's rule is about stored finished matches, not about predictions, and the TASO rule for which rows are a competition's own in a season already lives there. |
| A season before the first | Treated as the first: no list | It cannot hold a finished match. Reached only by a hand-typed season. |
| Which rows are a competition's | The prediction's own `competition_code`, joined to the match by its id | The log files a TASO match under the site's code (specs/052), so one join lists every group of a competition together and needs no category rule of its own. |
| The season in progress | `seasonId === activeSeasonId`, as goals per game decides it | S8: "as specs/048". |
| Ties | The earlier kickoff, then the lower match id | S12 names the kickoff. Two matches kicking off together need a second key for the order to be the same on every load. |
| The match page's read | One row by `(source, match id, elo-v1, backtest)`, the unique index's own columns; nothing is read for a draw or an unfinished match | A draw has no figure, so the page spends no query finding that out. |
| A shoot-out on the match page | Both penalty totals stored: they are taken out of the score before it is compared, in TypeScript, as `FOOTBALL_DATA_HOME_GOALS` does in SQL | The page already holds the row. Half a shoot-out is not one, as `formatScore` treats it. |
| A match in a competition's first stored season | Its page shows the line when Elo has a row for it | S9 is about the list. S7 says "a finished match Elo predicted". |
| A failed read on the match page | Nothing shown, the `error` line logged | The spec's failure string is the list's. A line about Elo failing would say more than the line it replaces. |
| Where the panel's markup lives | `season-surprises.tsx`, drawn by `CompetitionAnalyticsSection`; the match page's line in `match-surprise.tsx` | `competition-analytics.tsx` already holds three panels. |
| The match link | `/kotimaa/ottelu/:id` for TASO, `/ulkomaat/ottelu/:id` for football-data, a `RowLink` | Every covered football-data competition is under `/ulkomaat`. A link repeated per row is not prefetched (decisions/489). |
| The gate | `canSeeAnalytics()` before either read; signed out, the match page shows nothing, not a prompt | S10. The section already prompts once for the whole of `Analyysit`; a prompt under every finished score would say a figure is there. |
| The hourly step | `missingBacktestRows` in `prediction-backtest.ts`, pure: the baseline and Elo replayed whole and filtered against the written keys, Poisson fitted only for the days of a match lacking its row | S19. The first two take milliseconds whole. Poisson's fit per day is the backtest's cost. |
| Poisson for a few days | `replayPoisson` takes `wanted`: a day with no wanted match is not fitted, and each fitted day is warmed by the last day fitted | One code path for the whole backtest and the step. Fitting every day to carry the fit forward is the whole backtest, 28 s an hour. A fit stops when no parameter moves by more than the tolerance, so where it stops depends a little on where it started: a row written by the step differs from the whole backtest's in the fourth decimal of a probability; see Measured. |
| What "written" means | A key per `(source, match id, model)` of every stored backtest row, read once per run | The unique index's columns less `kind`. About 85 000 short rows once Poisson's are in. |
| The step's place in the run | After the live rows are written, from the same read of finished matches | S19. A failure is caught, logged and reported as `backtest`; the live rows are already stored. |
| A failed read of finished matches | Reported three times: `elo ratings`, `poisson strengths`, `backtest` | One read feeds all three, and each says what it could not do. |
| A row written between the step's read and its write | Overwritten by the step's, through the same upsert every prediction is written with | Only a hand-run backtest or a second run overlapping this one can write it, and each computes the row from the same stored matches: the same row for the baseline and Elo, and for Poisson the same to the fourth decimal, as under Measured. A second write path that skips on conflict would be more code for the same row. |
| A step that fails part-way | `backtested` is 0 and `backtest` is among the failures, though the batches that succeeded are stored | The count of a failed write is not known without a second read. The failure is what the run reports; the next run finds the stored rows written and writes the rest. |
| The cached reports | Dropped when the step had rows to write, whether or not the write succeeded; not touched when nothing was missing | As the hand-run backtest (decisions/056). Most hours write nothing, and should not empty a cache for it. |
| The report | `backtested` beside `logged`, in the `Predictions run finished` line and as `Backtested   N prediction(s)` | S19. |

## Where this differs from the spec

| The spec | Built | Why |
|---|---|---|
| The list's date as `21.4.2025` | `21.04.2025`, and the spec's example now says so | `matchDateFormatter`, the format every match list on the site prints. |
| Two strings marked proposed: the line saying draws are left out, and the line for a season whose matches were all drawn | Built as proposed | The start was given with them open; they are for Miikka to confirm or reword on the pull request. |
| "What it writes: what `predictions -- backtest` would write for that match" | True of the baseline and Elo exactly, and of Poisson to the fourth decimal | The warm start above. |

## What the tests prove, and how

- **Every mutation below was caught**, one row each, so the count is the
  table's length. Numbers 56 to 68 and 75 are caught by the integration suite:
  they change a query, which the unit tests mock.

  | # | Mutation |
  |---|---|
  | 1 | A draw given the away probability |
  | 2 | Home and away probabilities swapped |
  | 3 | The list most likely first |
  | 4 | Equal surprises the later kickoff first |
  | 5 | No match id behind a shared kickoff |
  | 6 | Eleven listed |
  | 7 | The list not cut |
  | 8 | The first season itself not the first |
  | 9 | A season before the first listed |
  | 10 | All drawn called empty |
  | 11 | No matches called all drawn |
  | 12 | Never in progress, in the rule |
  | 13 | Never in progress, in the service |
  | 14 | The first season read and ignored |
  | 15 | A TASO row without a score kept |
  | 16 | The shoot-out left in the match's score |
  | 17 | Half a shoot-out subtracted |
  | 18 | An unfinished match given a figure |
  | 19 | A drawn match read |
  | 20 | The season's failure logged without its season |
  | 21 | The match's failure logged without its id |
  | 22 | A failed season read answered as empty |
  | 23 | The latest stored season as the first |
  | 24 | No stored season answered as a number |
  | 25 | A TASO match linked under /ulkomaat |
  | 26 | A football-data match linked under /kotimaa |
  | 27 | The season's line on a finished season |
  | 28 | The draws note dropped |
  | 29 | The probability printed as a fraction |
  | 30 | The first season shown the no-matches line |
  | 31 | All drawn shown the no-matches line |
  | 32 | The team names outside the link |
  | 33 | The selected and active seasons swapped |
  | 34 | The active season named above the list |
  | 35 | The group not first |
  | 36 | The surprises read signed out |
  | 37 | The match line ungated |
  | 38 | The match line's probability as a fraction |
  | 39 | The match line under the kickoff |
  | 40 | The replay predicting unwanted matches |
  | 41 | The replay fitting every day |
  | 42 | A key without its model |
  | 43 | A key without its provider |
  | 44 | Written baseline rows rewritten |
  | 45 | Written Elo rows rewritten |
  | 46 | Written Poisson rows rewritten |
  | 47 | Poisson's missing rows looked up under Elo |
  | 48 | The step's rows not counted |
  | 49 | The step's failure not reported |
  | 50 | The step's failure not logged |
  | 51 | The step stamped with the run's start |
  | 52 | The reports dropped when nothing was written |
  | 53 | The reports kept when the step's write fails |
  | 54 | The step before the live rows |
  | 55 | The summary without its backtest line |
  | 56 | The list reading live rows too |
  | 57 | The list reading every model |
  | 58 | The list reading every competition |
  | 59 | The list reading both providers' rows |
  | 60 | The football-data list reading every season |
  | 61 | The TASO list reading every season |
  | 62 | The football-data list reading unfinished matches |
  | 63 | The football-data list with the shoot-out in the score |
  | 64 | The providers' list reads swapped |
  | 65 | The match's figure from a live row |
  | 66 | The match's figure from any model |
  | 67 | The match's figure from the other provider |
  | 68 | The step taking a live row for a written backtest row |
  | 69 | The season's line missing above the no-matches and all-drawn lines |
  | 70 | The no-matches line for all drawn |
  | 71 | An empty season never in progress |
  | 72 | An all-drawn season never in progress |
  | 73 | Draws ranked, cut to ten, then removed |
  | 74 | The Poisson window moved one match per fitted day |
  | 75 | The TASO list reading unfinished matches |

- **Unit**: the rules (`surprise.test.ts`), the service's decisions around its
  queries (`surprise-service.test.ts`), the panel and the line
  (`season-surprises.test.tsx`, `match-surprise.test.tsx`), the section's order
  and gate (`competition-analytics.test.tsx`), the line's place on the page
  (`foreign/match/[id]/page.test.tsx`), the first stored season
  (`match-service.test.ts`), the missing rows (`prediction-backtest.test.ts`,
  `poisson.test.ts`) and the run's step (`prediction-log-service.test.ts`,
  `predictions-plan.test.ts`).
- **Integration**: both joins against Postgres, with a live row, another
  model's row and the other provider's row of the same id beside the one read
  (`surprise.test.ts`); two hourly runs after a match finishes, the second
  writing nothing (`predictions.test.ts`).
- **End to end**: the list on the seeded 2017 season and the line on its match,
  signed in; neither page carrying a figure signed out (`surprise.spec.ts`).

## Measured

On production, read-only, on 2026-10-10: 28 287 finished matches and 56 436
backtest rows, none of them Poisson's yet.

| The step | Rows | Time |
|---|---|---|
| Reading the written keys | 56 436 | 282 ms |
| Nothing missing | 0 | 175 ms |
| The last three days' matches missing | 78, 26 per model | 333 ms |
| As production stood: every Poisson row missing | 28 255 | 28,5 s |

"Nothing missing" is every row the step can write being written. A match no
model can ever predict, such as those of a competition's first stored day,
stays without a row and is looked at again every hour; for Poisson that is a
fit of its day. The 175 ms includes them.

The read of finished matches, 513 ms, is one the run already made. The last
row is the hour after a release that adds a model, if the backtest has not
been run by hand first; `docs/infrastructure.md` says to run it.

How far a Poisson row written by the step is from the whole backtest's row of
the same match, the largest difference in any of the three probabilities:

| Days fitted | Rows | Largest difference |
|---|---|---|
| The last day with a match, per provider | 14 | 0,00009 |
| The last three days | 26 | 0,00006 |
| Every 97th match day of the history | 266 | 0,0004 |
| Every 7th | 3 333 | 0,002 |

The first two are what an hour's run does. The page prints whole percents.

The season's list on production, read-only, on 2026-10-12, with `predictions`
at 56 808 rows:

| Read | Plan | Time |
|---|---|---|
| Premier League 2025 | A sequential scan of `predictions`, hashed against the season's matches | 5,5 ms |
| Veikkausliiga 2026 | Sequential scans of `predictions` and `taso_matches` | 5,9 ms |
| Kakkonen 2026, the largest domestic competition | The same | 6,0 ms |

The table's one index starts with the provider and the match id, so a read by
competition scans it. The log grows by roughly 9 000 rows a year, three models
over some 3 000 matches, so the scan stays in single milliseconds for years;
no index is added, and the spec no longer calls the read indexed.

## After the reviews

Sourcery's first full review of #623 found five things.

| Finding | Outcome |
|---|---|
| A selective replay starts a day's fit from an older fit than the whole replay does, so its rows can differ | Measured, above, and not changed: the remedy offered, fitting every day, is the whole backtest every hour. The comment and this record no longer say the rows are equal |
| The e2e suite's cleanup deleted every Elo backtest row of the seeded 2017 season | Fixed: it removes its own match's row, and puts back the one it found |
| `Kausi … (kesken)` is missing above the no-matches and all-drawn lines | Fixed: `Kausi … (kesken)` without a list, above |
| A step failing part-way reports `Backtested 0` with rows stored | Not changed: a step that fails part-way, above |
| A report read before the step's write and cached after its drop stays 15 minutes | As decisions/055 and decisions/056 record for the hand-run backtest: nothing coordinates the two, and the cache's lifetime is the bound |

A second review, by another Claude session on 2026-10-11 while Sourcery's
budget was out, found no defect and seven smaller things.

| Finding | Outcome |
|---|---|
| No test fails when draws are ranked, cut to ten and then removed | Fixed: mutation 73 |
| No test fails when a day fitted after skipped days keeps matches past the horizon | Fixed: mutation 74 |
| The domestic list's finished filter is untested | Fixed: mutation 75 |
| Matches Poisson can never predict are fitted again every hour | Measured already, and now said: the note under Measured |
| A test's name still called the step's Poisson row the same to the fit's tolerance | Renamed |
| The panel's comment said the season's line is shown above every line | Reworded |
| The first-season line says Elo has no earlier matches, which S17's own reasoning says is not so for Ykkösliiga | Reworded, on Miikka's word on 2026-10-11: the competition has no earlier matches for the prediction to rest on, which is what the draw share lacks in every competition's first season. The spec's S17 carries the new line |

A third read, the same way and on the same day, found one stale comment and
one sentence of this record.

| Finding | Outcome |
|---|---|
| `tests/integration/predictions.test.ts` still said each run reads only that suite's rows | Reworded: the hourly run backtests every finished match stored, and the suite deletes every backtest row around each test |
| The row on a write between the step's read and its write read as if a Poisson row were identical | Reworded, above |
| The step does not run in an hour whose live write fails | Not changed: the run fails as it did before, and the next hour writes what is missing |
| A killed e2e run leaves its seeded row to be taken for the original | Not changed: only after a killed run, and only in the test database |

Sonar found one thing on the pull request: `replayPoisson` had grown to a
cognitive complexity of 17, over its limit of 15, with the `wanted` branch.
Finding where a day ends is now `endOfDay`; the replay does what it did.

Sourcery's second full review, of f170615 on 2026-10-12, found four things.

| Finding | Outcome |
|---|---|
| The season reads scan `predictions`, which has no index by competition | Measured, above, and no index added: 6 ms. The spec said "indexed" and no longer does |
| The spec's "What it writes" row promised the whole backtest's exact rows | Reworded in the spec: Poisson's can differ in the fourth decimal |
| `decisions/603-server-side-records.md` lists the hourly run's fields without `backtested` | Records are not edited; this one now says at its head that it adds the field |
| `missingBacktestRows`'s comment carried the measured difference | Cut: the comment says what the function does, and the difference is under Measured |
