# 056 — Prediction quality by competition: decisions

Implementation notes for `specs/056-accuracy-by-competition.md` (#353). The
spec says what is shown; this says how, and where the implementation had to
decide something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `prediction-quality.ts`, pure: `competitionsOf` groups, `lowestOf` marks, and `qualityReport` takes the competition order and, optionally, the one competition to count | As specs/054: every rule is unit-tested without a database, and the service only reads and caches. |
| The report's shape | `competitions: [{ code, matches, brier[], best[] }]` on every `ok` report, computed from all of the provider's common matches whichever competition the rest counts | The table stays on a filtered page (S9), so a filtered report carries it whole: one read and one cache entry per page, not two. |
| A filtered report | The same read as the unfiltered one, the rows of other competitions dropped in memory after the all-models rule | The table needs every competition's rows anyway. Filtering before or after `commonMatches` gives the same matches: the rule is per match. |
| A match's competition | The code its first model's row is filed under (`inCompetition`), for the rows and for the filter alike | Sourcery on #614. The log files every model's row of a match under one code, but nothing in the table makes it so. Grouped row by row, a match filed under two codes would give a model no rows in one of them: a mean of nothing, cached as `null`, and a page that fails on it. Grouped by match, every model has a row for every match counted. |
| The compared competitions | `qualityCompetitions(source)`: the provider's registry (`DOMESTIC_COMPETITIONS`, `SUPPORTED_COMPETITIONS`) in its own order, kept where `COMPETITIONS` in `goals-per-game.ts` has the code | S5's order is the picker's, and the log writes rows for exactly `COMPETITIONS` (specs/052). The same list orders the rows, says which `kilpailu` filters the page, and names the cache keys. |
| A competition outside that list | No row | The log writes none today. A code it stopped comparing would otherwise be a row whose name could not be linked. |
| The Champions League | A row under `Ulkomaat`, as the log holds its matches | `COMPETITIONS` includes `CL`, and production has 519 judged matches of it. The spec's "cups, which no model predicts" is about the domestic cups and the national teams, which the log never writes. |
| `kilpailu` | Parsed in `parseQualityParams` beside `alue` and `tyyppi`: a string that is one of the provider's compared competitions, exactly as the registry spells it, or nothing | One place decides, so the service is only ever given a known code and its cache key cannot carry a visitor's text. A repeated parameter falls back, as the other two do. |
| The best mark | `lowestOf` compares the scores rounded with `toFixed(SCORE_DECIMALS)`, the call the page formats with; the page takes its decimals from the same constant | S9: equal as shown is a tie. Comparing the unrounded values would bold one of two cells that read the same. |
| The best mark's markup | `<strong>` around the figure | The line under the table explains it; nothing else on the page is bold inside a cell. |
| The current row | Its link carries `aria-current="page"` and is semibold, not underlined, as the switches mark theirs | It links to the page being shown. |
| The filter's line | Between the switches and the window line, on every state of a filtered page: figures, the empty line and the failure line | S11: the way back has to be there when the competition has nothing judged, and it comes from the address, not from the read. |
| The switches on a filtered page | `Jälkikäteen lasketut` and `Ennakkoon tehdyt` carry `kilpailu`; `Kotimaa` and `Ulkomaat` do not | S9, S11. |
| `Ottelut` | `Intl.NumberFormat("fi-FI")`, as the window line | `1 520`, as the spec draws it. |
| The table on a phone | Its cells' side padding is 8 px under `sm`, 16 px from it | At 375 px with 16 px the `Poisson` column was cut off behind the longest names (`Briotech Kansallinen Liiga`); seen in the screenshot, not in a test. |
| The cache | `quality:v3:<provider>:<kind>`, and `…:<code>` for one competition, 15 minutes | Per provider, kind and competition (spec). `v3` because a report cached under `v2` has no `competitions`, and the page would fail on it for up to 15 minutes after a deploy. |
| A backtest and the cached reports | `runPredictionBacktest` drops `qualityCacheKeys(source, "backtest")`: the provider's own key and one per compared competition, 22 keys in all | decisions/055 dropped the one key there was, so the rows a backtest writes are seen at once. A filtered page is cached apart now and would otherwise show the older figures for up to 15 minutes. |
| The failure line in the log | `Unable to read the prediction quality`, with `competition` only when one was asked for | S12. An unfiltered read's line is as it was. |

## What the tests prove, and how

- **Every mutation below was caught**, one row each, so the count is the
  table's length:

  | # | Mutation |
  |---|---|
  | 1 | The lowest mark on the highest score |
  | 2 | The lowest compared unrounded |
  | 3 | Only the first of equal scores marked |
  | 4 | A competition's count per row, not per match |
  | 5 | A competition without a common match given a row |
  | 6 | The rows in the data's order, not the given one |
  | 7 | The competition filter ignored |
  | 8 | The rows per competition from the filtered matches |
  | 9 | Scores to two decimals |
  | 10 | The cache key without its competition |
  | 11 | The cache key still `v2` |
  | 12 | Competitions that are not compared listed |
  | 13 | The domestic registry for both providers |
  | 14 | The competition not given to the report |
  | 15 | The order not given to the report |
  | 16 | The competition never logged |
  | 17 | A null competition logged |
  | 18 | Only the provider's own key listed |
  | 19 | The backtest dropping only the provider's own key |
  | 20 | The lowest score not bold |
  | 21 | Every score bold |
  | 22 | The count without its thousands grouped |
  | 23 | A competition's link without its competition |
  | 24 | The filtered row not marked current |
  | 25 | Every row marked current |
  | 26 | `Ennakkoon tehdyt` dropping the competition |
  | 27 | `Jälkikäteen lasketut` dropping the competition |
  | 28 | The provider switch keeping the competition |
  | 29 | The link back keeping the competition |
  | 30 | The filter's line never shown |
  | 31 | Any `kilpailu` accepted |
  | 32 | A `kilpailu` checked against the domestic list only |
  | 33 | football-data's competitions named from the domestic registry |
  | 34 | The read without the competition |
  | 35 | The note under the table dropped |
  | 36 | The filter in the address misnamed |
  | 37 | Integration: the competition read from another column |
  | 38 | A match's rows grouped each by its own code |
  | 39 | A competition's rows kept each by its own code |
  | 40 | Integration: football-data's competition read from the match |
  | 41 | Integration: TASO's competition read from the match |
  | 42 | The filter's sentence below the empty line |

- **None survived.** 38 to 41 came with the first review: 37 read the
  provider's name for the code, which no fixture could mistake, where 40 and
  41 read the stored match's code, which the first fixture could. 42 came
  with the second.
- **Integration**, against Postgres: predictions filed under two competitions
  grouped by the code each carries, in the picker's order; one competition's
  report counting its matches only with the table still whole; a compared
  competition without a judged match empty.
  The match of one fixture is stored under another competition than its
  predictions are filed under, and TASO's under `spljp25`, so the prediction's
  code is the one that decides.
- **End to end**, against a production build: the table and its line; a
  competition's name opens the filtered page, its row current; the kind switch
  keeps the competition and `Kaikki kilpailut` and the provider switch drop it;
  another provider's `kilpailu` shows the unfiltered page.
- **By eye**: the table and a filtered page at 375 px and 1280 px, light and
  dark, with six competitions seeded into the test database.

## After the reviews

Sourcery's first full review of #614 found four things.

| Finding | Outcome |
|---|---|
| A match whose models' rows carry different codes divides by an empty set | Fixed: a match's competition, above |
| The integration test passes if the stored match's code is read | Fixed: mutations 40 and 41 |
| A report read before a backtest and cached after its drop stays 15 minutes | As decisions/055 records for the one key there was: nothing coordinates the two, and the cache's lifetime is the bound. The keys are more now; the window is the same |
| A filtered page with nothing judged shows no table | S11: the empty line under the filter's line and the link back. Such a competition has no row in the table to mark |

The second found eight and the third one. The cached-report window came back
in both, with the same answer. New in the second:

| Finding | Outcome |
|---|---|
| The empty filtered page's test does not check where the sentence sits | Fixed: mutation 42 |
| `filteredSentence`'s comment says the page counts | Reworded |
| `kilpailu` is a Finnish identifier, four times | Not changed: it is the address's own key, as `alue` and `tyyppi` (decisions/012); the identifiers around it are English |
| A report cached before the e2e fixture is seeded would hide its match | Not changed here: the suite has read these cached reports since specs/054 and has no Redis client. A chore of its own if it is wanted |

## Measured

On production, read-only, on 2026-10-10. Production has no `poisson-v1` rows
until this release's backtest has run there, so the baseline's rows were
copied in memory under the third model to time a report of full size:

| Provider | Rows read | Read | Report | Report JSON | One competition's report | Its JSON |
|---|---|---|---|---|---|---|
| TASO | 30 936 (46 400 with the copy) | 300 ms | 32 ms | 47 KB | 15 ms | 40 KB |
| football-data | 22 314 (33 500 with the copy) | 94 ms | 21 ms | 46 KB | 9 ms | 40 KB |

A filtered page's miss is the same read as the unfiltered one and a smaller
pass. Each of the twenty compared competitions can hold one more cached report
of about 40 KB per kind for 15 minutes, under a megabyte if every one were
asked for at once.
