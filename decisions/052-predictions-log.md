# 052 — Predictions log: decisions

Implementation notes for `specs/052-predictions-log.md` (#349). The spec says
what is logged and when; this says how, and where the implementation had to
decide something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `prediction-log.ts` (the windows, which competitions to refresh, the live row) and `prediction-backtest.ts`, both pure; `prediction-log-service.ts` does the reads, refreshes and writes | As `outcome-shares.ts` and `home-baseline.ts`: every rule is unit-tested without a database, and the integration test proves the SQL. |
| How a competition is refreshed | Each provider's `getSeasonMatches`, through its 15-minute Redis response cache, then the `synchronizeMatches` every page uses | Not through the pages' staleness check: football-data's is an hour by default (`FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS`), and an hourly run gated by it would skip every other refresh. The spec first said "the existing cached sync"; it now says what is meant. |
| Read again after refreshing | The candidates are read a second time before logging | A refresh can postpone a match or finish one (S4, S5); logging from the first read would write a prediction for a match that is no longer upcoming. |
| A TASO target | Carries its season's `(competition_id, category_id)` in the type, so the fetch never has to check for it | The first version typed both as nullable and guarded the fetch; lcov showed the guard never taken. Removing the path, not keeping the guard. |
| When the clock is read | At the start, to choose what to refresh, and again just before writing, which both filters the rows and stamps `predicted_at` | Sourcery, on #508: pacing can take minutes, and a match that kicked off meanwhile must not be written (S5). A match that enters the window during the run has no baseline read and waits for the next run. |
| Concurrency | Refreshes, baseline reads and batched writes run concurrently; the pacer queues its callers | Sonar flagged each `await` inside a loop. The refreshes had been sequential only to keep the pacing right, so the pacer now spaces concurrent callers itself, and a test starts three at once. |
| Failures | A failed refresh is logged and the competition is still logged from stored rows; a failed baseline skips that competition; either is listed and the run exits 1. A failed write fails the run | S1: one competition's trouble must not cost the others their predictions, and Railway still marks the run failed. A competition with no history yet (`empty`) is not a failure. |
| Backtest predictions | Through `homeBaseline`, the panel's own rule, fed a tally of the strictly earlier matches | One definition of the shares for the panel, the live run and the backtest. |
| A backtest row's `predicted_at` | The time the backtest ran | It records when the row was written; the kickoff it was made against is `kickoff_at`, and #350 orders by that. |
| Batching | 1 000 rows per insert | Eleven columns a row, well under Postgres's 65 535 parameters; the local test database's backtest was 4 701 rows. |
| Probabilities | `double precision`, 0–1, unrounded | `real` would lose digits a Brier score reads. |
| The pacer | Moved from `scripts/backfill-run.ts` to `src/lib/pacer.ts`, with its rates, and made safe to call concurrently | The backfill and the hourly run spend the same football-data key; one pacer and one statement of the 9-a-minute rate. The backfill still calls it one request at a time, which the queue does not change. |
| The command | `npm run predictions -- log` and `-- backtest`, one runner with a tested `predictions-plan.ts` | The repository's runner split: only the I/O shell is excluded from coverage. |
| The database it writes | `DATABASE_URL` from the environment only; `.env`'s is ignored | As `backfill.ts`: a forgotten variable must not write predictions into a development database. |
| The Railway service | Configured in the dashboard, every setting listed in `docs/setup/024-predictions-cron.md` | Railway's config as code is deprecated and "new services cannot opt into" it; existing `railway.toml` files work until 2026-12-01. Migrating to its replacement is separate work. |
| Integration fixture ids | Block `985` | `tests/unit/scripts/integration-fixtures.test.ts` gives each integration file its own block; `993` is `team-search`'s. |

## What the tests prove, and how

- **Twenty-seven mutations, all caught.**
  - In the rules: both ends of the 48-hour window, a passed kickoff, `TIMED`, a stored result still refreshed, the 24-hour window's start, no result refresh at all, percentages written as probabilities, a TASO target without its pair.
  - In the backtest: a tally that never grows, draws uncounted, matches at one kickoff informing each other, providers mixed.
  - In the service: football-data unpaced, no second read, a baseline failure unreported, a baseline read per match, the batch size, a refresh failure stopping the run, TASO rows not filed by their pair.
  - In the pacer and the runner: no sleep, no queue for concurrent callers, a failed run exiting 0.
  - After review: filtering or stamping with the start time rather than the write time.
  - In the SQL, against Postgres: `kickoff_at` or `predicted_at` not updated on conflict, the shoot-out left in the score.
- **The integration test seeds the history it predicts from.** Its first version passed locally on rows earlier e2e runs had left in the test database, and failed in CI, whose database starts empty: with no history the baseline is empty and the run rightly writes nothing. Each hourly-run test now inserts its competition's finished match; the suite was then run against a freshly reset test database.
- **The integration test isolates by date**, not only by id: the hourly run is set in 2099 and the backtest in 1990, so each reads only its own rows around its dates, and the backtest's probabilities are exact whatever else the database holds. Provider fetches are stubbed to return nothing.

## Measured

Against the local test database (never the development one):

| Command | Result | Time | Peak memory |
|---|---|---|---|
| `predictions -- backtest` | 4 701 rows | 1.2 s | 190 MB |
| `predictions -- log` | nothing in the window | 0.6 s | 113 MB |

Both under the spec's cost assumption of 0.25 GB for about a minute. Railway's
container start is not in these figures; the first week's usage is.

The live run's logging was not seen against real upcoming fixtures here: the
test database held none inside the 48 hours. The integration test covers it,
and the first production runs will show it.

## Moved from comments, 2026-10-06

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`predictions`.** Because the result is read and not copied, a corrected
  score corrects every figure built on it. The `live` row is the last
  prediction before kickoff, overwritten until then; the `backtest` row is
  what the model would have said from the matches before it.

Cut from `src/lib/prediction-log-service.ts` at `dc74e3e` by #531.

- **`refresh` in the predictions log.** football-data's page staleness check
  is an hour by default, and an hourly run gated by it would skip every other
  refresh.
- **`runPredictionLog`.** A competition that fails to refresh is still
  logged from what is stored, and one whose baseline fails is skipped; either
  makes the run exit non-zero, and a failed write fails the run. The clock is
  read again just before writing: pacing the refreshes can take minutes, and
  a match that kicked off in the meantime must not be written after its
  kickoff.
