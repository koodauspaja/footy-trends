# 057 — Surprise index: decisions

Implementation notes for `specs/057-surprise-index.md` (#354). The spec says
what is shown; this says how, and where the implementation had to decide
something the spec did not.

This record overrides one line of `decisions/052-predictions-log.md` and
specs/052 S10: backtest rows are no longer written by hand only. The hourly
run writes the ones that are missing (S13, S19). The whole backtest by hand is
unchanged.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `surprise.ts`, pure: `surpriseOf` reads a result's probability, `seasonSurprises` ranks and cuts, `isFirstStoredSeason` is S9 | As specs/054: every rule is unit-tested without a database, and `surprise-service.ts` only reads. |
| A draw | `surpriseOf` answers `null`, so a draw is neither ranked nor given a line | S18. One function decides for the list and for the match page. |
| A season's states | `ok`, `first-season`, `empty`, `all-drawn`, `error` | One per line of the spec's string table, so the panel never infers a state from an empty list. |
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
| Poisson for a few days | `replayPoisson` takes `wanted`: a day with no wanted match is not fitted, and each fitted day is warmed by the fitted day before it | One code path for the whole backtest and the step. A warm start changes how long a fit takes, not where it ends (decisions/055), so a row written by the step equals the whole backtest's to the fit's tolerance. |
| What "written" means | A key per `(source, match id, model)` of every stored backtest row, read once per run | The unique index's columns less `kind`. About 85 000 short rows once Poisson's are in. |
| The step's place in the run | After the live rows are written, from the same read of finished matches | S19. A failure is caught, logged and reported as `backtest`; the live rows are already stored. |
| A failed read of finished matches | Reported three times: `elo ratings`, `poisson strengths`, `backtest` | One read feeds all three, and each says what it could not do. |
| The cached reports | Dropped when the step had rows to write, whether or not the write succeeded; not touched when nothing was missing | As the hand-run backtest (decisions/056). Most hours write nothing, and should not empty a cache for it. |
| The report | `backtested` beside `logged`, in the `Predictions run finished` line and as `Backtested   N prediction(s)` | S19. |

## Where this differs from the spec

| The spec | Built | Why |
|---|---|---|
| The list's date as `21.4.2025` | `21.04.2025` | `matchDateFormatter`, the format every match list on the site prints. |
| Two strings marked proposed: the line saying draws are left out, and the line for a season whose matches were all drawn | Built as proposed | The start was given with them open; they are for Miikka to confirm or reword on the pull request. |
| "What it writes: what `predictions -- backtest` would write for that match" | True of the baseline and Elo exactly, and of Poisson to the fit's tolerance | The warm start above. |

## What the tests prove, and how

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

The read of finished matches, 513 ms, is one the run already made. The last
row is the hour after a release that adds a model, if the backtest has not
been run by hand first; `docs/infrastructure.md` says to run it.
