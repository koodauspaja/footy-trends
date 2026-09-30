# 052 — Predictions log: every prediction recorded before kickoff

> **Status: all questions (Q1–Q15) answered in chat on 2026-09-30; issue #349
> in Ready.** Written for #349, the second of the
> prediction features, after specs/051 (#343). Nothing reads the log yet:
> #350 (rolling accuracy), #351 (Brier score, log-loss, calibration), #352
> (model against model) and #353 (per competition) all will.

## Summary

A prediction is only worth judging if it was made before the match. This
records, for every upcoming match a model predicts, what it predicted and
when, so that after the final whistle the prediction can be set against the
result. The first model is specs/051's `home-baseline-v1`; every later one
(#344 Elo, #345 Poisson) writes to the same log under its own name.

Nothing is shown to readers in this feature (S8). Its value appears when
#350–#353 read it.

## Scope

### In scope

- A new table, `predictions`, holding one live and one backtest prediction per match per model (S3, S14), with the
  three probabilities, the model identifier, and when it was made.
- A scheduled job filling it (S1), for the matches specs/051 predicts:
  upcoming matches in specs/049 S6's competitions kicking off within 48 hours
  (S6, S7).
- `home-baseline-v1` as the first model logged.
- A backtest script writing a row for every stored finished match with history (S10, S14).
- A Railway cron service running the job hourly in production (S11, S12), and its setup documented.

### Out of scope

- Any chart or figure read from the log — #350–#353.
- Any new model — #344 onward.
- A change to what the `Ennuste` panel shows.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | How the log fills | **A scheduled job**: a Railway cron service — a second service built from this repository, with a cron schedule, that runs one command and exits — not a Railway Function, which is a single file edited on Railway's canvas outside git and could not use this code, logging every covered upcoming match inside the window (S7) | Miikka, 2026-09-30 (Q1): "let's go with b. we need to check the railway costs though on the interval". A page-view log would judge a model by the matches readers happened to open. The interval is Q12. |
| S2 | Backtesting | **Yes**, stored as `kind = backtest`, never mixed with `live` without saying so | Miikka, 2026-09-30 (Q2). #350–#353 then have years of matches at launch. How it is produced is Q10. |
| S3 | Rows per match | **One live row per match per model**, overwritten until kickoff and frozen after: the last prediction before kickoff is the one judged | Miikka, 2026-09-30 (Q3). |
| S4 | Postponed or rescheduled | **The row follows the match**: `kickoff_at` updates, and it keeps being overwritten until the match actually kicks off | Miikka, 2026-09-30 (Q4). |
| S5 | When a prediction is final | **By time**: a row is written only while `now < kickoff_at` | Miikka, 2026-09-30 (Q5). Status syncs lazily and can lag. |
| S6 | Competitions | **specs/051's set** — what a model predicts | Miikka, 2026-09-30 (Q6). |
| S7 | Window | **Upcoming matches kicking off within 48 hours** | Miikka, 2026-09-30 (Q7): "yes, the limit is important to find". It bounds the job's provider requests; see Performance & Limits. |
| S8 | A view of the log | **None** in this feature | Miikka, 2026-09-30 (Q8). |
| S9 | Retention | **Every row kept** | Miikka, 2026-09-30 (Q9). |
| S10 | Producing the backtest | **A script writing `kind = backtest` rows**, idempotent, run once per environment after deploy and again whenever a model is added | Miikka, 2026-09-30 (Q10). #350–#353 read one table the same way for both kinds, and "what was known before kickoff" is computed once. |
| S11 | Environments | **The job runs in production only**; staging runs it by hand | Miikka, 2026-09-30 (Q11). The football-data key is shared between the two (docs/setup/021). |
| S12 | Interval | **Hourly** (`0 * * * *`, UTC) | Miikka, 2026-09-30 (Q12): "hourly is fine for costs". About $0.11 a month by Performance & Limits' estimate; the first week's real usage is checked against it. |
| S13 | Fixture refresh | **A competition with a stored upcoming match inside the window is refreshed** through each provider's 15-minute response cache and the existing sync before its matches are logged | Miikka, 2026-09-30 (Q13). Without it, a postponement no reader loaded keeps its old kickoff and S4 never fires. |
| S14 | What a backtest prediction knows | **The competition's finished matches with a strictly earlier kickoff**; a competition's first stored match gets no backtest row | Miikka, 2026-09-30 (Q14). Two matches played at the same time are not evidence for each other; no history, no percentages, as specs/051 S9. |
| S15 | Fetching results | **A competition is also refreshed when a stored match of it kicked off in the past 24 hours and still has no stored result** — one refresh serving both, not one each | Miikka, 2026-09-30: "yes, that sounds good since we are now sending requests to api's anyway". Without it, a round's results wait for the next round to come within 48 hours, and a season's last round is never fetched by the job. The 24 hours: Miikka, 2026-09-30 (Q15), "that's good". |

## UX / UI (Finnish strings)

None, unless Q8 adds an admin view.

## API & Data

**A new table, one migration** (`npm run db:generate -- --name=create_predictions`).

Proposed shape:

| Column | Type | Note |
|---|---|---|
| `id` | serial | |
| `source` | text | `football-data` or `taso` — the two id spaces never meet (specs/026) |
| `provider_match_id` | integer | The match, joined to `matches` or `taso_matches` at read time |
| `competition_code` | text | As specs/051 files it, so #353 needs no second lookup |
| `model` | text | `home-baseline-v1` |
| `home_probability`, `draw_probability`, `away_probability` | real | 0–1, unrounded |
| `predicted_at` | timestamptz | When the prediction was made |
| `kickoff_at` | timestamptz | The kickoff it was made against |
| `kind` | text | `live` or `backtest` (S2); unique on (`source`, `provider_match_id`, `model`, `kind`) (S3) |

The result is **not** copied in: it is read from the match row when a
calibration feature needs it, so a corrected score (#492) corrects every
figure.

**Caching:** none — a write path, and nothing reads the table yet.

## Edge Cases

To be completed once the questions are answered. Known so far:

| Case | Behaviour |
|---|---|
| A match postponed after its prediction was logged | The row stays, `kickoff_at` follows the new date, and it keeps updating until the match kicks off (S4) |
| A match whose kickoff time changes | The same row, its `kickoff_at` updated (S4) |
| The same match seen by many runs before kickoff | One row, overwritten by each run while `now < kickoff_at` (S3, S5) |
| A match that kicks off with no live row (the job failed, or the match was added inside the last interval) | No live row; it is never written after kickoff (S5). Its backtest row still exists (S2) |
| A run fails | Logged, the run exits non-zero, and the next run tries again; a missed run costs at most one interval of freshness |
| A match kicking off inside the window, cancelled | Its row stays as last written; #350–#353 read only matches with a result |
| A model's rule changes | A new model name (`-v2`); old predictions keep theirs (specs/051 S10) |
| A match whose kickoff has passed but whose status still reads `SCHEDULED` | Not written: the kickoff time decides (S5) |
| A postponed match whose old kickoff has passed | Its row keeps the old `kickoff_at` until the match is rescheduled into the window; then the same row is overwritten with the new one (S4) |
| A match that kicked off 3 hours ago, no result stored | Its competition is refreshed, storing the result (S15) |
| A match that kicked off over 24 hours ago, still no result | No longer a reason to refresh; left to page views, as today (S15) |
| A fixture moved into the window that no sync has stored yet | Logged from the first run after something stores it; the job refreshes only competitions it already knows have a match inside the window (S13) |
| Two matches of a competition at the same kickoff (a final round) | Neither is evidence for the other's backtest (S14) |
| A competition's first stored match | No backtest row (S14) |
| The backtest script run twice | The same rows; nothing duplicated (S10) |
| A run in staging | Only when started by hand (S11) |

## Performance & Limits

**The binding limit is football-data.org's: 10 requests a minute on the free
tier, one key shared by staging, production and every reader's page view**
(docs/setup/007, docs/setup/021). TASO publishes no limit; the backfill paces
it at 60 a minute.

What one run asks of the providers, as proposed (Q11, Q12):

| | Per run |
|---|---|
| Competitions considered | The 20 of specs/051's set (10 football-data, 10 TASO) |
| Fixture refreshes | Only for a competition with a stored match kicking off inside the 48-hour window (S7), or one that kicked off in the past 24 hours with no stored result (S15) — one refresh either way, through each provider's 15-minute response cache and the sync every page uses; a competition fetched in the last 15 minutes costs nothing |
| football-data requests | At most 10, paced at 9 a minute as the backfill does — at most about one minute of the shared budget per run |
| TASO requests | At most one per competition's category in the window |
| Everything else | Stored rows: the baseline and the write |

A weekend with every football-data league playing is the worst case: ten
requests in a run. On a quiet day, none.

**Railway cost, from the project's own usage.** Railway's forecast for
2026-09-10 – 10-10, both environments, before this feature: **$4.10** of the
$5 Hobby includes — memory $3.99 (17 236 GB-minutes, about 0.4 GB held on
average), CPU $0.06 (122 vCPU-minutes), the rest under a cent each. About $0.90
of headroom a month; memory, not CPU, is what a run costs.

Assuming a run holds about 0.25 GB for about a minute, container start
included (to be measured, Q12), roughly $0.00015 a run:

| Interval | Runs a month | Added | Forecast total |
|---|---|---|---|
| Every 5 minutes (Railway's minimum) | 8 640 | ~$1.30 | ~$5.40, over the included $5 |
| Every 15 minutes | 2 880 | ~$0.43 | ~$4.53 |
| **Hourly** | 720 | **~$0.11** | **~$4.21** |

Railway bills what a run uses, not what it is allotted. A run that
overruns the next is skipped by Railway, not queued.

## Security & Secrets

A Railway cron service in production (S11), referencing the web service's
`DATABASE_URL`, `REDIS_URL`, `FOOTBALL_DATA_API_KEY`, `TASO_API_KEY`, and the
Axiom variables — no new secret. Set up in the dashboard, as
`docs/setup/024-predictions-cron.md` lists: Railway no longer lets a new
service use `railway.toml`.

## Acceptance Criteria

- [ ] A named migration creates `predictions`, unique on (`source`, `provider_match_id`, `model`, `kind`)
- [ ] A run logs `home-baseline-v1` for every stored `SCHEDULED` or `TIMED` match of specs/051's competitions kicking off within 48 hours, with the probabilities specs/051's panel would show for it
- [ ] A second run before kickoff overwrites the same row — one live row per match per model
- [ ] Nothing is written for a match whose kickoff has passed, whatever its status
- [ ] A rescheduled match's row follows it: the same row, the new `kickoff_at`
- [ ] A run refreshes a competition only when it has a stored upcoming match inside the window, or a match that kicked off in the past 24 hours with no stored result — once, however many such matches — through each provider's 15-minute response cache and the existing sync, with football-data requests paced at 9 a minute
- [ ] After a run, a refreshed competition's finished matches have their results stored
- [ ] A failed run is logged and exits non-zero; a failure in one competition does not stop the others
- [ ] The backtest script writes a `backtest` row for every stored finished match with an earlier finished match in its competition, from those earlier matches only, and a second run changes nothing
- [ ] A shoot-out draw counts as a draw in both kinds, as specs/049 S3
- [ ] The job runs hourly in production only, as a Railway cron service, and its setup is in `docs/setup/`
- [ ] After a week, the service's Railway usage is compared with the estimate here, and the result is written down
- [ ] No reader-visible change

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/prediction-log.test.ts` | Which matches are in the window, both edges; which just-played matches trigger a refresh, both edges of the 24 hours, and a stored result not triggering one; one refresh for a competition with both; a passed kickoff skipped whatever the status; the probabilities are specs/051's; a failing competition does not stop the others; which competitions are refreshed |
| `tests/unit/lib/prediction-backtest.test.ts` | History strictly before kickoff; same-kickoff matches excluded; first match has no row; a shoot-out draw a draw |
| `tests/unit/scripts/…` | Each script's wiring: exit code on failure, the pacing, the environment it runs against |
| `tests/unit/db/migrations.test.ts` | Already fails an unnamed migration |
| `tests/integration/…` | Against Postgres: the upsert keeps one row per match, model and kind; a rescheduled match updates `kickoff_at`; a passed kickoff is not written; the backtest reads only earlier matches and is idempotent |

Every new test is mutation-checked before review, per `skills/self-review.md`.
No e2e: nothing a reader sees changes (S8).

## Files To Update

- `specs/052-predictions-log.md` (this file)
- `src/db/schema.ts` and a named migration
- `src/lib/prediction-log.ts` (the run's rules), `src/lib/prediction-backtest.ts`,
  `src/lib/prediction-log-service.ts` (their I/O), and `scripts/predictions.ts`
  with its tested `scripts/predictions-plan.ts`
- `docs/setup/024-predictions-cron.md`: the Railway cron service, its schedule
  and variables, and running the backtest after deploy
- `decisions/052-predictions-log.md`, by the implementing agent

## Open Questions

**None.** Q1–Q15 were answered in chat on 2026-09-30 and are recorded as
S1–S15.
