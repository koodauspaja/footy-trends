# 031 — Rolling form trend: decisions

Implementation notes for `specs/031-rolling-form-trend.md` (#327). The spec says
what the chart does; this says how, and where the implementation had to decide
something the spec did not.

## The one property everything serves

**The last point equals the `Vire` column the standings page shows**, converted
to points. Form is not a new calculation: `calculateStandings` already takes a
team's last five finished matches in kickoff order for that column, and this
chart plots the same five after every match. The tests check it against the real
`getStandings` and `getSeasonStandings`, and the e2e tests against the standings
page itself, for Arsenal 2024/25 and for KuPS across Veikkausliiga 2026's split.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Order of matches | Kickoff, then provider match id | Kickoff is `Vire`'s own order. It also keeps TASO's out-of-order round numbers (#413) out of this chart entirely: the x-axis is the team's own match count, which a reader checks against the table's `O` column. The id tie-break cannot matter for one team, whose matches never share a kickoff, but a stable order costs one comparison. |
| The first point | The fifth match (Q4) | `formSeries` returns `too-few` before that. The standings table's `Vire` shows a single result after one match; the chart differs on purpose, as the spec records. |
| Which TASO matches count | Every group that renders as a table, own-calculated or pass-through (Q2) | Read from `classifySeasonGroups`, the same `cache()`d classification the position chart uses, so the page makes no new read. A `match-list` group (a playoff, a cup round) is left out. A test pins the case where the two charts part ways: an unverified season has no position (`unavailable`) but does have a form. |
| A team with no table-group match | No panel (`unavailable`) | It played only in match lists, so there is no league form. A season with nothing stored at all is `too-few` instead, matching the position chart's `no-rounds`: the league exists, it just has no matches yet. |
| Where the gate lives | In the new `AnalyticsSection`, once, before any loader (Q5) | A signed-out request calls neither loader, so the page carries no position and no form, not even hidden. The per-chart gate in #331's `LeaguePositionSection` is gone rather than kept beside it; two gates would be two places to get it wrong. |
| Panels as functions, not components | `positionPanel(series)` and `formPanel(series)` return an element or `null` | The section has to know whether any panel exists, to show no `Analyysit` at all when none does. A component returning `null` cannot tell its parent that. |
| One panel shape | `ChartPanel`: a region named by an `h3` | Both charts are regions under the `h2` `Analyysit`, so a screen reader can move between them. One component, so #328 and #329 get the same shape without copying it. |
| Loading | Both series in parallel | They share the cached season read, so this is just not waiting for one before starting the other. |
| The y-axis | 0 to 3, ticks at every whole number, not inverted | More points is higher, the other way up from the position chart beside it. The axis reaches 3 whatever the team's form, so a poor run looks poor. |
| Decimals | `toFixed(1)` with a comma | Form over five matches moves in fifths, so one decimal is exact, and `toFixed` hides floating point (`0.2 × 3` is `0.6000000000000001`). A test pins that case. |

## What the tests prove, and how

- **Equality with `Vire`**, three ways: the pure function against
  `calculateStandings`' own `form`; each service against the real
  `getStandings` / `getSeasonStandings`; and end to end against the standings
  page's Vire cell, for a football-data team and a TASO team across a split.
- **The request budget**: football-data makes one read, TASO the same two the
  position chart makes, and neither asks a provider anything.
- **Twelve mutations**, all caught: ignoring kickoff order, dropping the id
  tie-break, drawing partial windows, scoring a loss as a draw, reading every
  match from the home side, counting a playoff, never returning `unavailable`,
  counting unfinished matches, hiding the section when one chart is missing,
  removing the gate, drawing the chart upside down, and printing unrounded
  decimals.

## Left open, deliberately

- **A signed-out reader on a page where no chart applies** still sees
  `Analyysit` and the prompt, and after signing in sees no section. This is
  #331's case, unchanged: the gate runs before the series are computed, so the
  signed-out page cannot know.
