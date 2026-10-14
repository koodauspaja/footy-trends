# 059 — Predictions for cup competitions: decisions

Implementation notes for `specs/059-cup-predictions.md` (#516). The spec says
what is predicted; this says how, and where the implementation had to decide
something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The models' set (S11) | `PREDICTED_COMPETITIONS` in `home-baseline.ts`: `COMPETITIONS` plus `PREDICTED_CUPS` (`MSC`, `NSC`) for TASO, `COMPETITIONS` itself for football-data. Every read the models make takes it: `baselineCompetition`, the hourly run's candidates, `readFinished`, `qualityCompetitions` | One set, beside `baselineCompetition`, which already decided what is predicted. `COMPETITIONS` keeps placing goals per game and `Analyysit`, so a cup page gains neither. |
| A cup tie in the history | `readFinished` marks it `cup: true`; `EloMatch`, and so `PoissonMatch` and `FinishedMatch`, carry the flag | One read feeds the backtests, the live ratings and the fits. The flag travels with the match, so no model looks its competition up again. |
| Rated (S3, S10) | `isRated(ratings, team)`: the team has an Elo rating. The league replay rates a side only from a match it played, so this is a covered league or Champions League match at a strictly earlier kickoff | The Elo replay is the one place every model's history passes through, and its map already answers the question. A placeholder side is never rated, so a bracket slot is no prediction (specs/053). |
| Elo and a cup tie (S2) | In `replayElo`, a cup tie at a kickoff is handed to `onPredict` from the ratings before that kickoff when both sides are rated, and then left out of the kickoff's updates | The ratings are those of the league matches only, so `elo-v1` and every league row are unchanged, which the backtest test asserts on a history with and without the cups. |
| Poisson and a cup tie (S5) | `fitWindow` sweeps over the league matches only. Then `cupFits` gives each cup with a tie between two teams the fit knows a goal rate (its goals over the league strengths' expectation, with the competitions' prior) and its own draw factor, marked `cup: true` | The strengths are the leagues', so nothing a cup does moves them. The goal rate and the draw factor are fitted as a league's are, with the strengths held. |
| Poisson and an unknown side | `predictPoisson` answers `null` in a cup when a side is not in the fit, where in a league it is an average side | S3. The fit knows a side exactly when it has played a league match on an earlier day. |
| Poisson on a side's first league day | A side whose first league match is earlier on the cup tie's own UTC day is rated for Elo and the baseline, not yet for Poisson, so that tie has no Poisson row | Poisson fits once per UTC day (specs/055 S9). Such a tie drops out of `/ennusteet`'s common matches, as any match a model has no row for. |
| The baseline (S4) | Each cup's own outcome shares, as for a league, and in `backtestRows` only for a tie between rated sides (`ratedSides`). The tally still counts every finished tie | S4: the cup's own history, all of it. The row needs both sides rated so that every model has the same matches. |
| The live log | The hourly run writes a cup tie's rows only when its provider's ratings were read and both sides are rated, every model alike | S3. A history that could not be read cannot say a side is rated, so the tie waits for the next hour. |
| `Ennuste` and the rivalry group (S8) | `predictsSides(stored, competition)` in `match-prediction.tsx`: true for a league; for a cup, the Elo ratings read and both sides rated. `MatchPrediction` and the rivalry page's `loadNext` ask it after `baselineCompetition` | One rule for both places. It reads `getEloRatings`, which the body reads anyway, from the same cache. |
| Signed out on a cup tie | `predictsSides` is asked before the gate, so a tie with an unrated side has no sign-in prompt either | The prompt promises a prediction. A cached ratings read is the cost, and it is made only for a cup tie. |
| `/ennusteet` (S7) | `qualityReport` takes `apart`, competitions left out of the figures of all but given their rows; `getPredictionQuality` passes `PREDICTED_CUPS` for TASO. `CUPS_APART_NOTE` is shown under `Kilpailuittain` when a cup has a row | The rows per competition are still read from every competition, so a cup has its row and the leagues' figures are those they were. |
| The cache keys | Unchanged: `quality:v3:*`, `poisson:v1:*`, `elo:v1:*` | S15. A report or fit cached from before the release has no cup in it and expires in 15 minutes. Nothing cached is wrong, only short of the cups. |
| The cached fit | `PoissonSnapshot` types a competition's `cup` | JSON carries the flag either way; the type now says so, and a test reads a cup back through the cache's JSON. |
| Neutral venues (S6) | The side TASO lists first is at home | TASO marks no neutral venue. |
| The surprise figure (S13) | Nothing new. `getMatchSurprise` reads a match's Elo backtest row by its id, so a cup tie with one has its figure | The integration test reads it for a cup tie the backtest predicted. |
| The season simulation | Nothing changes | It predicts league fixtures from the fit's league entries, which the sweep over leagues alone leaves as they were. |

## What the tests prove, and how

- **Every mutation below was caught**, one row each, so the count is the
  table's length:

  | # | Mutation |
  |---|---|
  | 1 | `PREDICTED_CUPS` gains `LC` |
  | 2 | `PREDICTED_CUPS` loses `NSC` |
  | 3 | `isPredictedCup` true for football-data |
  | 4 | `COMPETITIONS` read in place of `PREDICTED_COMPETITIONS` by `baselineCompetition` |
  | 5 | `readFinished` marks no tie a cup |
  | 6 | Elo: a cup tie updates the ratings |
  | 7 | Elo: a cup tie predicted with one side unrated |
  | 8 | Elo: a cup tie never predicted |
  | 9 | Poisson: the cups in the sweep |
  | 10 | Poisson: a cup's goal rate without the prior |
  | 11 | Poisson: a cup's draw factor of the leagues' |
  | 12 | Poisson: an unknown side in a cup an average side |
  | 13 | Backtest: a cup tie's side rated at the same kickoff |
  | 14 | Backtest: a cup tie with an unrated side given a row |
  | 15 | Backtest: an unrated side's tie left out of the tally |
  | 16 | Log: a cup tie logged with an unrated side |
  | 17 | Log: a cup tie logged without the ratings read |
  | 18 | `predictsSides`: a cup tie predicted with one side unrated |
  | 19 | `predictsSides`: a cup tie predicted when the ratings failed |
  | 20 | `predictsSides`: a league match asked about its sides |
  | 21 | Rivalry: the next meeting predicted with an unrated side |
  | 22 | `qualityReport`: the cups in the figures of all |
  | 23 | `qualityReport`: the cups' rows dropped |
  | 24 | `getPredictionQuality`: no competition kept apart |
  | 25 | `/ennusteet`: the line shown without a cup row |
  | 26 | `/ennusteet`: the line never shown |
  | 27 | The cached fit loses `cup` |

- **None survived.**
- **Integration**, against Postgres: a league match rates two sides, a cup
  opener between them ends level after extra time, settled on penalties; the
  next tie between them gets a row from each model, the baseline a draw for
  certain from that one shoot-out; a tie with a side that has played no league
  match gets none. The tie's surprise figure is read from its Elo row: 0 here,
  since a cup draw share of 1 is used as it is (S10).
- **End to end**, against a production build, on fixtures in 2099: a Suomen
  Cup tie between two sides a league match rated shows `Ennuste` with its
  link to the cup's record; one with an unrated side and a Liigacup tie show
  none; a rivalry whose next meeting is a cup tie between rated sides is
  predicted, and one whose sides have met only in the cup is not.

## Measured

On production, read-only, on 2026-10-14: stored finished Suomen Cup ties,
men's and women's together, run from 67 to 418 a season since 2015, so the
backtest has the cup histories S4 asks for.
