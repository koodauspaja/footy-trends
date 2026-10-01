# 054 — Prediction quality: decisions

Implementation notes for `specs/054-prediction-quality.md` (#350, #351, #352).
The spec says what is judged and shown; this says how, and where the
implementation had to decide something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `prediction-quality.ts`, pure: the pick, Brier, log-loss, the both-models filter, the rolling line, the calibration bins and the whole report | Every rule is unit-tested without a database; `prediction-quality-service.ts` only reads and caches. |
| The read | One join per provider and kind, `predictions` to `matches` or `taso_matches`, finished with both scores and season ≥ the floor; football-data's goals through `FOOTBALL_DATA_HOME_GOALS` / `_AWAY_GOALS` | The same shoot-out subtraction every other football-data figure uses (specs/049 S3), so a shoot-out is a draw here as it is elsewhere. |
| The model filter in the query | Kept, although `commonMatches` would drop a third model's rows anyway | It keeps rows a later model writes (#345) out of the read. The mutation that removes it survives, as it must: the result is the same. |
| The window line | `{n} ottelua vuosilta 2016–2026` (`vuodelta` for one year), from the kickoff years | The spec's `kausilta` would need two labels — calendar seasons for TASO, spanning ones for football-data — and football-data's Brasileirão plays calendar years, so `2023/24–2025/26` would misdescribe part of it. The years the matches were played are true for every competition. A change to S13's wording, raised for review on the pull request. |
| The per-season table's labels | TASO's as calendar years, football-data's as spanning seasons (`2025/26`) | The labels the rest of the site uses for each provider. Brasileirão's matches sit under the season football-data files them in, so its `2025` is in the `2025/26` row; the table is one pool per provider (S4), not per competition (S10, #353). |
| The report's shape | Each line carries its model: `rolling: [{model, points}]`, `calibration: [{model, bins}]` | Lines matched to models by index needed a fallback that could never be taken, and lcov counted it as a condition never taken. |
| The rolling line's points | Every step-th window, step `⌈windows / 400⌉`, plus always the last | Domestically there are about 15 000 windows; a 640-unit chart cannot show more than a few hundred, and a 30 KB cached report stays small. Keeping the last means the line ends on today's figure, so it can carry 401 points. |
| The rolling line's dots | None (`dots: false`, as specs/053) | Hundreds of points; a dot each would be a band. |
| The rolling chart's axes | x from the first point to the last, ticked at each New Year inside; y from the tens below the lowest to above the highest, never less than ten points high | Legible at 375 px; the year ticks thin on a phone as specs/048's charts do. |
| Calibration's points | At each bin's middle (5, 15, …, 95), the diagonal from 0 to 100 | A point at the lower edge would sit left of the probabilities it stands for. |
| The cache | `quality:v1:<provider>:<kind>`, 15 minutes, the report as it is | The report is plain numbers and strings, so it survives the JSON the cache helper stores; dates are carried as epoch milliseconds. |
| `Ennuste`'s link | Under the rounding line, `Kuinka hyvin ennusteet ovat osuneet?` | S13. |

## What the tests prove, and how

- **Every mutation below was caught**, one row each, so the count is the
  table's length:

  | # | Mutation |
  |---|---|
  | 1 | The pick: home beating a tied draw dropped |
  | 2 | The pick: home beating a tied away dropped |
  | 3 | The pick: draw beating a tied away dropped |
  | 4 | Brier not squared |
  | 5 | Log-loss without its 0,001 floor |
  | 6 | A match one model predicted judged |
  | 7 | The rows not sorted by kickoff |
  | 8 | A shared kickoff not ordered by match id |
  | 9 | The rolling line at exactly 200 matches dropped |
  | 10 | The window's oldest match subtracted one late |
  | 11 | The last rolling point not kept |
  | 12 | The thinning step rounded down |
  | 13 | The thinning step counting one window too few |
  | 14 | A probability of 1 outside the last bin |
  | 15 | A bin of exactly 50 left off |
  | 16 | A bin counting the outcomes that did not happen |
  | 17 | The rolling line drawn at exactly 200 matches as too few |
  | 18 | Seasons in reverse |
  | 19 | A season's count per row, not per match |
  | 20 | The omitted-bin note inverted |
  | 21 | The window's first year from the last match |
  | 22 | The last season the first |
  | 23 | Kind not filtered |
  | 24 | football-data's season floor dropped |
  | 25 | football-data's finished filter dropped |
  | 26 | The shoot-out kept in the score |
  | 27 | Provider not filtered |
  | 28 | The baseline drawn solid and Elo dashed |
  | 29 | The y axis from 0 |
  | 30 | The y axis to 100 |
  | 31 | A flat line's axis of zero height |
  | 32 | Year ticks outside the line |
  | 33 | The x axis from 0 |
  | 34 | The text alternative reading the first point, not the latest |
  | 35 | Calibration points at the bin's edge |
  | 36 | The text alternative's bin ranges wrong |
  | 37 | An omitted bin drawn |
  | 38 | The backtest note on the live page |
  | 39 | football-data's seasons labelled as calendar years |
  | 40 | `Kotimaa` always current |
  | 41 | `Jälkikäteen lasketut` always current |
  | 42 | `Ennakkoon tehdyt` linking to the backtest |
  | 43 | The rolling chart's caption changed |

- **Fourteen first survived**, all closed with a test: the two sort orders
  (every fixture was already in order), the last rolling point and both
  thinning-step mutations (no count was asserted exactly), a bin of exactly 50,
  the in-play match (its fixture had no score, so the score filter hid the
  status filter), the dashes, both axes, the bin centres, the text
  alternative's ranges and the non-current switches.
- **One survives by design**: the query's model filter, above.
- **Integration**, against Postgres: a shoot-out judged a draw, an in-play
  match, a 2022 match, a one-model match and a third model's row left out, a
  contrary backtest row on the same match not mixed into the live figures, and
  TASO matches judged from their own table.
- **End to end**: the home tile leads to the page; with a seeded match and both
  models' rows, the window line, the per-model percentages, both tables and the
  calibration's three lines render; the switches keep each other's choice;
  signed out, no figure is in the HTML.

## Measured

On staging, which holds the same data as production (read-only). Staging has
no `elo-v1` rows until release 2 deploys, so the baseline's rows were copied
in memory under a second model to time a report of full size:

| Provider | Kind | Rows read | Read | Report | Report JSON |
|---|---|---|---|---|---|
| TASO | backtest | 15 382 | 285 ms | 34 ms | 31 KB |
| football-data | backtest | 11 155 | 108 ms | 17 ms | 30 KB |
| either | live | 0 | 35 ms | — | — |

With `elo-v1` the rows read double, so a miss is roughly half a second from a
laptop, less inside Railway; a hit parses in under a millisecond. One miss per
provider and kind per 15 minutes — S11's no-table decision holds.
