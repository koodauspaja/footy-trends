# 053 — Elo ratings: decisions

Implementation notes for `specs/053-elo-ratings.md` (#344). The spec says what
is rated and shown; this says how, and where the implementation had to decide
something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `elo.ts`, pure: the constants, the expectation, the three-way split, the season regression and the replay | Every rule is unit-tested without a database; the services only read and write. |
| One read for everything | specs/052's `readFinished` gains the two teams and the season, and an optional provider filter | The baseline backtest, the Elo backtest, the hourly run's ratings and the pages' ratings all count the same matches — the shoot-out subtracted (specs/049 S3), TASO filed by its season pair. |
| The backtest's draw share | The baseline backtest's own draw probability for that match | S15 asks for the draw share of strictly earlier matches; the baseline backtest already computes exactly that, so the two models know the same about draws, and a competition's first kickoff has no row under either (S16). |
| Same-kickoff matches | Rated from the ratings before any of them; every change at that kickoff is added up, then applied | S14 and specs/052 S14. Two different matches never share a team at one moment, so this changes nothing for real fixtures; a stored duplicate pairing is the case it guards, and Sourcery on #513 found the first version kept only the last of such a team's updates. |
| A failed Elo read in the hourly run | Logged, reported as `elo ratings`, and no Elo row written; the baseline's rows are still written | Sourcery on #513: the first version threw before any write. No Elo row may come from ratings that were never read, which a fallback to 1500 would be. |
| The cache | One JSON snapshot per provider, `elo:v1:<provider>`, 15 minutes: current ratings, and each team's history as `[season, rating]` pairs to one decimal | The cache helper stores JSON, so Maps and Dates do not survive it; the compact pairs keep the snapshot to 316 KB (football-data) and 485 KB (TASO). The hourly run and the backtest never read it (S17). |
| `Ennuste`'s layout | A small table sized to its content, not `DataTable` | `DataTable`'s flexible column has a 240px floor, which at 375px scrolled `Tasapeli` and `Vierasvoitto` off the screen. Its sibling-alignment reason does not apply to a single panel. |
| The model column's heading | `Malli`, for screen readers only | An empty header cell is announced as nothing. Visually the column stays unheaded, as S13's table shows; `Malli` is the one string added beyond the spec's. |
| A placeholder side | No Elo row and no failure line; the baseline stays | Not a failure: there is no team to rate (spec, Edge Cases). |
| The chart's x axis | The season, each match spread evenly within its own | Ticks label themselves with the season, and a gap in a club's covered seasons shows as a gap rather than being squeezed out. On a database with missing seasons the line crosses a gap straight; production stores every season, so a gap there means the club was outside the covered competitions. |
| The chart's dots | `LineSeries` gains `dots: false` | A club has hundreds of matches; a dot at each would be a band of dots. Marked points are still ringed, for any later use. |
| The y axis | Whole fifties around the ratings, ticked every 50, or every 100 past a 300-point span | Legible at 375px; a 1500 tick appears whenever the range includes it. |
| A national team's page | `loadElo` answers `unavailable`, so the panel is absent | S5. |
| Season labels on the chart | The page's own: a football-data club's as its competition spans (`2025/26`), a TASO club's as calendar years | The same labels the rest of the page uses. |

## What the tests prove, and how

- **Thirty mutations, all caught**: K, the home advantage and its sign,
  the 400 scale, regressing within a season, no regression, a draw scored as a
  loss, the away side moving the same way, the kickoff order, placeholders
  rated, the draw not taken out; the Elo backtest without a draw share or with
  providers mixed; the live row without its season, for a placeholder, or not
  written at all; the cache's lifetime, reading both providers, an empty team
  as `ok`; a same-kickoff update overwritten, an Elo read failure unreported or answered from 1500; the failure line hidden, the draw share not the baseline's, the
  season ignored in the panel; dots drawn, the axis step, a season dropped
  from the text alternative, the panel outside `Muut kaudet`.
- **Two first survived**, both closed with a test: same-kickoff matches rated
  one after another (shown only by a duplicated pairing), and the live row
  ignoring the match's season (now a team regressed into a new season).
- **Integration**, against Postgres: the Elo backtest's probabilities followed
  by hand through two seeded matches between the same pair, the draw share the
  baseline's, and the hourly run writing one `elo-v1` row beside the baseline.
- **End to end**: the seeded upcoming match shows `Perustaso` and `Elo` rows
  and the Elo line; a real Veikkausliiga club's page shows the panel in
  `Muut kaudet`, a line, the 1500 note and a rating per season; signed out,
  neither carries a value.

## Measured

On staging, which holds the same data as production (read-only):

| Provider | Matches | Teams | Read | Replay | Parse cached | Snapshot |
|---|---|---|---|---|---|---|
| football-data | 11 168 | 256 | 439 ms | 10 ms | 1 ms | 316 KB |
| TASO | 16 996 | 420 | 139 ms | 11 ms | 2 ms | 485 KB |

The reads crossed the public internet from a laptop; inside Railway they are
shorter. The replay is negligible, a cache hit is a millisecond or two, and a
miss is one read per provider per 15 minutes — S11's no-table decision holds.

Screenshots at 375px in light and dark, and 1280px, of both the panel and
`Ennuste`; the first version of `Ennuste` failed at 375px and is described
above.
