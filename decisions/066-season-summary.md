# 066 — Season summary (`Kausi lyhyesti`): decisions

Implementation notes for `specs/066-season-summary.md` (#356). The spec says
what is shown; this says how, and where the implementation had to decide
something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `season-summary.ts`, pure: one detector per fact (`sideFact`, `runFacts`, `upsetFact`), `rankFacts` for R5, and `seasonSummaryFor`, which reads through readers the caller passes | As `comparisonFor` and `recordsFor`: one orchestrator for both providers, every rule unit-tested without a database. |
| The read path | `season-summary-service.ts` adds the upset read and the one `error` line. Each provider's `getTeamSeasonSummary` is `teamSeasonSummary(source, { isLeague, read, records })`: its league rule, its own season reader and its own `getTeamStreakRecords` | The providers differ only in how a season is read, which they already say once for `Tämä kausi verrattuna`; the first draft wrote the rest out twice, and Sonar counted it as duplicated lines. The block's records are `Ennätykset`'s own call, so the two cannot disagree. |
| What is read for a past season or a cup | A cup: nothing, its competition is not a league. A past season: itself and the league seasons after it, the reads `Ennätykset` already makes. The earlier seasons, the records and the upset are read only once the selected season is the latest and has five matches played | S9 and S6. Most team-page views are not the latest season. |
| The latest league season (S9) | The latest the club has **played a match in**: a later league season, in any division, counts only once one of its matches involving the club is finished | A season's fixtures are stored before it starts, TASO's in the winter and football-data's in the summer; read literally, the unplayed season would take the block away from every page until five of its matches were played. Miikka, 2026-10-15: "Latest with a played match". |
| Rounding before comparing (R1) | Two decimals, `POINTS_DECIMALS`: `Number(value.toFixed(2))` to compare, `formatDecimal(value, 2)` to print, the same `toFixed` the panel prints with | `Koti- ja vierastilastot` prints `2,38`, not the one decimal R1 assumed; Miikka chose two on 2026-10-15 ("Two, as the panel"), so the sentence's figure is the panel's. Two seasons the panel prints alike are equal, whichever way binary rounding went. |
| An earlier season with no match on that side | Stops the count, as an equal season does | A count past a season with no figure would claim a comparison it did not make. Only a hand-built season can lack every home match. |
| An earlier season with nothing stored | Left out of the comparison, as `Tämä kausi verrattuna` leaves it out (`readSeasons`) | One rule for what a compared season is, on the same page. |
| The upset's ceiling (S10) | Below 25 % **as printed**: `Math.round(probability * 100) < 25` | A win Elo gave 24,6 % prints `25 %`; under a raw comparison the block would state a figure its own rule says is not under 25 %. R1's rule, applied to the upset's figure. |
| The upset's read | `getTeamUpset` beside `getSeasonSurprises`: the same backtest query, narrowed in TypeScript by `teamUpset` in `surprise.ts`, ordered as the list orders | The list's query already returns the season's predicted matches; a second query for one team would duplicate its join. `predictedIn` now picks the provider's query for both. |
| A failure's log line | `getSeasonSummary` logs `Unable to summarise the season` once for every `error` it returns: a read that reported failure (no `err`), or anything thrown, the upset's read included (with `err`) | The spec's one log line carries the provider, team, competition and season, which a season reader's own `warn` and `getSeasonSurprises`' line do not. The first draft logged only what was thrown, so a failed season read showed the failure line with nothing at `error`; a read-only review found it. |
| The in-progress line | `inProgressSeasonLine` from `competition-analytics.tsx`, the line specs/057's list prints | The same `Kausi 2026 (kesken)` wherever a season is marked in progress. |
| In progress | `seasonId === activeSeasonId`, as specs/057 and goals per game decide it | One rule for `(kesken)` across the site. |
| Where the sentences live | Beside the block, in `season-summary-section.tsx`, not in `lib/` | They print with `formatDecimal`, `percentText` (through `eloGaveText`) and `teamDisplayName`; the first two are components', and nothing in `lib/` imports a component. As `eloGaveText` sits in `season-surprises.tsx`. |
| `1 ottelu` | A run of one match is singular | Finnish counts one thing differently, as `Ennätykset` does. The spec's table shows only plurals. |
| The upset's link | `next/link`, built by the team page from its `basePath`, the same function the match list uses | One link, not one per row, so it is not a `RowLink` (decisions/489). The page already knows where its matches live. |
| A failed season lookup | The team page passes `null` for the seasons and the summary decides: a cup or a national team has no block either way, a league season shows the failure line | Read as no seasons, a league season would silently show no block. The first draft answered `error` in the team page before the loader was asked, as `loadRecords` does, which put the failure line on cup and national-team pages that never have a block. |
| A later season played, and another read failed | No block: one later season the club has played in settles that the selected one is not the latest, whatever else failed | Asked first, before any failure counts, so a past season does not show the failure line it cannot need. |
| A national team | `loadSummary` answers `unavailable` on both national-team pages | S6. |

## Where this differs from the spec

| The spec | Built | Why |
|---|---|---|
| R4 and the edge-case table: "A run equal to the earlier record counts, as specs/039 S7 gives a tie to the most recent run" | Stated when `Ennätykset` names the selected season, which it does for a tie **between two spells** (S7). A tie **inside one spell** of consecutive seasons is not stated. The spec now says so | specs/039 S7 is about blocks: inside a block `streaksOf` reports the first of equally long runs, so `Ennätykset` names the earlier season. The spec's mechanism (the API table: "the fact holds when the record's span ends in the selected season") and its reason ("so the sentence agrees with `Ennätykset`") both give this. Miikka, 2026-10-15: "Follow Ennätykset". |
| R1's "(one decimal)" and the sentences' `2,4` | Two decimals, `2,38`. The spec now says so | Above, under "Rounding before comparing". |
| Sentences in `season-summary-sentences.ts`, tested in `tests/unit/lib/` | In `season-summary-section.tsx`, tested in `tests/unit/components/season-summary-section.test.tsx`. The spec now says so | Above, under "Where the sentences live". |

## What the tests prove, and how

- **Every mutation below was caught but one**, which is equivalent and says so.
  Each was applied alone, the named test files run, and the source restored.
  One more, the `sideFact` guard on fewer than three earlier seasons, survived
  and was a finding: the count it guards cannot reach three without them, so
  the guard was deleted rather than tested.

  | # | Mutation | Caught by |
  |---|---|---|
  | 1–4 | `MIN_EARLIER_SEASONS` 3 → 2, `MIN_MATCHES` 5 → 4, `UPSET_BELOW_PERCENT` 25 → 26, `MAX_FACTS` 3 → 4 | `season-summary.test.ts` |
  | 5 | `POINTS_DECIMALS` 2 → 1 | `season-summary.test.ts`, `season-summary-section.test.tsx` |
  | 6 | An earlier season with no match on the side no longer stops the count | `season-summary.test.ts` |
  | 7, 8 | A best that only equals counts as beating; likewise a worst | `season-summary.test.ts` |
  | 9 | `everySeason` always false | `season-summary.test.ts` |
  | 10 | Only `best` looked for | `season-summary.test.ts` |
  | 11 | Both runs of a direction stated | `season-summary.test.ts` |
  | 12 | A record stated whatever season it ends in | `season-summary.test.ts` |
  | 13 | The run fact without three earlier seasons | `season-summary.test.ts` |
  | 14 | A side with four matches gets a fact | `season-summary.test.ts` |
  | 15, 16 | The upset at 25 % kept; the upset's figure floored, not rounded | `season-summary.test.ts` |
  | 17 | An unbeaten run unfavourable | `season-summary.test.ts` |
  | 18 | A worst side favourable | `season-summary.test.ts` |
  | 19 | Favourable no longer first | `season-summary.test.ts` |
  | 20 | A run counts as beating no season | `season-summary.test.ts` |
  | 21, 22 | The tie order home before the run; away before home | `season-summary.test.ts` |
  | 23 | The upset ranked first | `season-summary.test.ts` |
  | 24 | The count no longer orders facts | `season-summary.test.ts` |
  | 25, 26 | A cup season, a past season given a block | `season-summary.test.ts` |
  | 27 | A block before five matches | `season-summary.test.ts` |
  | 28, 29 | Other competitions' seasons compared; the selected season compared with itself | `season-summary.test.ts` |
  | 30 | Earlier seasons oldest first | `season-summary.test.ts` |
  | 31, 32 | A failed earlier read, a failed records read, ignored | `season-summary.test.ts` |
  | 33 | Never in progress | `season-summary.test.ts` |
  | 34 | A block with no fact | `season-summary.test.ts` |
  | 35, 36 | A failed selected read read as nothing stored, and the reverse | `season-summary.test.ts` |
  | 37 | The wrong season's label | `season-summary.test.ts` |
  | 38 | `teamUpset` counts a home defeat | `surprise.test.ts` |
  | 39 | `teamUpset` ignores away wins | `surprise.test.ts` |
  | 40, 41 | `teamUpset` over every match; the likeliest win, not the least | `surprise.test.ts` |
  | 42 | `getTeamUpset` reads the first stored season | `surprise-service.test.ts` |
  | 43 | `getTeamUpset` for another team | `surprise-service.test.ts` |
  | 44 | The upset read from the wrong provider | `season-summary-service.test.ts` |
  | 45, 46 | The log line without the season, or reworded | `season-summary-service.test.ts` |
  | 47–53 | `Paras` and `Heikoin` swapped; `vierassaldo` lost; the count without the selected season; `tallennetuilla kausilla` inverted; `1 ottelua`; two runs' names swapped | `season-summary-section.test.tsx` |
  | 54 | `(kesken)` inverted | `season-summary-section.test.tsx` |
  | 55 | No failure line | `season-summary-section.test.tsx`, `analytics-section.test.tsx` |
  | 56 | The upset linked to another match | `season-summary-section.test.tsx` |
  | 57 | Two runs keyed alike | `season-summary-section.test.tsx` |
  | 58 | An `unavailable` series rendered | `season-summary-section.test.tsx` |
  | 59 | The probability printed as a hundred times itself | `season-summary-section.test.tsx` |
  | 60 | The block left out of `Analyysit` | `analytics-section.test.tsx` |
  | 61, 62 | A failed season lookup read as no seasons; the match link without the region | both team page tests |
  | 63 | The TASO page's active season replaced by the selected one | domestic team page test |
  | 64 | The national-teams test inverted on `/ulkomaat` | foreign and national-teams page tests |
  | 65 | `nationalTeamAnalytics` offers a block | `national-team-analytics.test.ts` |
  | 66–69 | Either provider's `isLeague` taking a cup; football-data's records, TASO's season reader, replaced | `standings-service.test.ts`, `taso-standings-service.test.ts` |
  | 70–72 | A later season counting with nothing played; a later season ignored; the selected season counted as its own successor | `season-summary.test.ts` |
  | 73 | A failed later read ignored | `season-summary.test.ts` |
  | 74, 75 | Only home matches, only away matches, counted as played in a later season | `season-summary.test.ts` |
  | 76, 77 | The selected season not required among the club's league seasons; matched by year alone. Both caught, and the check is gone since: the cup check (86) replaced it once the seasons could be `null` | `season-summary.test.ts` |
  | 78 | A selected season with nothing stored read as stored | `season-summary.test.ts` |
  | 79, 80 | Either provider's `teamSeasonSummary` given the other's source | `standings-service.test.ts`, `taso-standings-service.test.ts` |
  | 81–85 | `teamSeasonSummary` reading for another team, passing no seasons to the records, selecting the active season, taking every competition as a league, dropping the page's label | the same two |
  | 86–91 | The cup check, the failed-lookup check, the played-later check and its threshold, the failed later read, the seasons passed to the records | `season-summary.test.ts` |
  | 92, 93 | No line for a read that reported failure; a line for a block | `season-summary-service.test.ts` |
  | 94, 95 | The team page passing the seasons when the lookup failed, or answering `error` itself | the team page tests and `national-teams/pages.test.tsx` |
  | 96 | The played-later rule disabled | `season-summary.spec.ts`, end to end |

  Equivalent, and so not caught: `teamUpset`'s home condition `>` → `>=`. A
  draw that passes the filter is dropped by `ranked`, which skips every match
  `surpriseOf` gives no figure.
- **The query** is the one `getSeasonSurprises` already runs; `tests/integration/surprise.test.ts`
  adds the team filter and the first stored season against Postgres.
- **End to end**, `tests/e2e/season-summary.spec.ts` seeds a club into four
  Premier League seasons, 2020/21 to 2023/24, and one Elo backtest row, and reads
  each sentence's number back from its panel: `3,00` from `Koti- ja
  vierastilastot`, `6 voittoa Kausi 2023/24` from `Ennätykset`, `12 %` from the
  match page the upset links to. The same club's 2023/24 loses its block once one
  2024/25 match of the club is stored, which proves the latest-season rule: a
  real club's past football-data season has too few earlier seasons for a block
  either way. A cup season, England's World Cup page and `/maajoukkueet/huuhkajat`
  show no block; those are what the criterion asks to see, while the rule behind
  them is the unit tests'. It removes the rows and the cached reads they reached
  (`elo:v1`, `poisson:v1`, the backtest reports, the forecasts and the five
  seasons' tables), as `rivalry-prediction.spec.ts` does for TASO.

## Measured

The render time of `/kotimaa/joukkue/60731?kilpailu=VL&kausi=2026` (HJK, six
stored Veikkausliiga seasons, the most of any club in the test database), signed
in, production builds of `main` (`7afb18d`) and this branch side by side against
the test database, 3 warm-up requests each and then 25 alternating:

| Build | Median | 90th percentile | Fastest | Slowest |
|---|---|---|---|---|
| `main` | 36 ms | 41 ms | 32 ms | 49 ms |
| This branch | 48 ms | 57 ms | 41 ms | 62 ms |

HJK's 2026 has no fact, but every read the block makes runs before that is
known, so the cost is the same with or without sentences. What the block adds
to a render is the records computed a second time over the cached season reads,
the earlier seasons' home and away counts, and the upset's two queries (the
competition's first stored season and its backtest rows); how the 12 ms splits
between them was not measured. Ilves, KuPS, SJK and IFK Mariehamn
get a block on the same data; at 375 px, light and dark, it wraps with no
horizontal scroll.
