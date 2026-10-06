# 048 — Goals per game across a competition's seasons: decisions

Implementation notes for `specs/048-league-goals-per-game-trend.md` (#341). The
spec says what the page shows; this says how, and where the implementation had
to decide something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `goals-per-game.ts`, pure: which competitions (S5), which seasons are drawn (S8, S10), which are named as left out (S14), the in-progress flag (S7) and the y-axis (S13) | The service only reads totals, so every rule is unit-tested without a database, and the integration test only has to prove the SQL. |
| The read | One `GROUP BY season` aggregate per competition, in `match-service.ts` beside specs/044's averages | S1, S6: every finished match with both scores, every stage. A count and a sum per season is all the line needs; no match rows cross the wire. |
| TASO's seasons | Read over every category id the registry has published the competition under, then keep each season's own `(competition_id, category_id)` pair from `competitionIdForSeason` / `categoryIdForSeason` | S2: a renamed junior series is one line. Filtering by the pair rather than the category alone keeps out a cup published under the same category that season. |
| A failed read | `GoalsPerGameSeries` carries `error` as its own case, logged | Never the too-few message: a failure shares no value with "no data". |
| A season with no finished match | Neither drawn nor named under the chart | S14 names a season left out by the five-match minimum; a season with nothing played has not started, and saying it "shows at five matches" would be noise every August. |
| The y-axis | `halfStepAxis` doubles before rounding, and is at least 0,5 tall | S13. Doubling keeps a value on a step, such as 2,5, as that end rather than the next step; a league flat at 3,0 still gets an axis. |
| The section | `CompetitionAnalyticsSection`, awaited by both standings pages as `AnalyticsSection` is | S4: the gate is asked before anything is read, and a competition without the section asks neither the gate nor the database. Awaited rather than nested, because an async component in JSX is not something every renderer can draw. |
| Season labels | The page passes its own labeller: `formatSeasonLabel` on football-data, the year on TASO | The line's ticks, its text alternative and S14's sentence then name a season exactly as the page's own selector does. |
| The chart | `LineChart` gains `marked` points, `formatXTick`/`formatYTick`, `xTickNote` and `thinXTicksOnPhone`, all optional | Every existing chart passes none and renders unchanged; its 94 tests pass as they were. |
| `(kesken)` | A `tspan` a row below its tick; a chart with a note grows its bottom margin | S15, asked at the start of implementation. |
| A last label wider than the margin | The plot ends short of the axis by what the label lacks | Found in the first 375-px screenshot: `2026/27` and `(kesken)` ran off the drawing. Every earlier chart's last label fits the margin, so theirs keep the full plot. |
| Crowded season labels on a phone | Below `sm`, every other label hidden, counting back from the latest, when neighbours would touch at the phone font; every label from `sm` up | S16, asked after measuring: twelve Veikkausliiga seasons leave each label about the width it needs, with no gap. Counting back keeps the latest season and its note labelled. |

## What the tests prove, and how

- **Thirty-eight mutations, all caught**: the five-match boundary, the
  two-season minimum, the left-out rule, the axis' rounding and minimum height,
  the in-progress flag, the competition list, both halves of TASO's pair filter,
  the log context, the football-data code, status and score clauses, the TASO
  status clause, the goal sum, the ring, the note, the left-out sentence, the
  gate, both tick formatters, the text alternative's `(kesken)`, the note row,
  the note's position, the plot's right inset and its floor, the thinning's
  direction, gap, walk and opt-in, and what each page passes: the labeller, the
  active season and the placement under the legend.
- **The TASO status clause first survived.** Its fixture was an unplayed match
  with no score, which the score clause excluded anyway; it is now a `Live`
  match with a score so far, which only the status clause excludes.
- **The integration test uses competition codes no provider issues**, because
  the read spans a competition's whole stored history and the real codes hold
  other suites' fixtures.
- **The e2e asserts rules, not values** (#485): a point per described season,
  one ring on a drawn season, the same line under two seasons with only the
  ring moved, and no goals-per-game text in a signed-out page's HTML. Removing
  the gate fails the signed-out case.

## Verified against local data

Premier League and Veikkausliiga signed in, at 375 px in light and dark and at
1280 px: the ring on the page's season, `(kesken)` under the latest season, the
full label at the right edge, and on the phone Veikkausliiga's labels thinned to
every other one from 2026. The World Cup, the men's cup and the Liigacup show no
`Analyysit` at all.

## Moved from comments, 2026-10-06

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`getGoalsPerGame`.** A failed read is its own case, never "too few". A
  TASO competition is read over every category id the registry has published
  it under, and each season keeps only the `(competition_id, category_id)`
  pair the registry names for it: a competition renamed or re-coded between
  seasons is one line, and a category reused by another competition in
  another season is not counted.

Cut from `src/components/charts/line-chart.tsx` at `a86c1cb` by #531.

- **`ChartPoint.marked`.** The season a page is showing.
- **`xTickNote`.** `(kesken)` under the season in progress.
- **`thinXTicksOnPhone`.** Counting back from the last tick means the latest
  season and its note always show.
- **The overhang in `LineChart`.** A label or note wider than twice the margin
  would run off the drawing. No chart before this feature needed it.
