# 032 — Goals scored vs conceded: decisions

Implementation notes for `specs/032-goals-scored-vs-conceded.md` (#328). The spec
says what the two charts do; this says how, and where the implementation had to
decide something the spec did not.

## The properties everything serves

- **The last running total equals the standings table's `TM` and `PM`.** Checked
  against `calculateStandings`, the real `getStandings` and `getSeasonStandings`,
  and end to end against the standings page for Arsenal 2024/25 (69 and 34) and
  for KuPS across Veikkausliiga 2026's split.
- **The three result charts count the same matches, in the same order.** The
  rolling goals chart's fifth point is the form chart's fifth point.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| One match order for every chart | `teamMatchesInOrder` and `goalsFor`, moved out of `formSeries` and exported from `form-series.ts` | The form chart already ordered a team's matches and read its side of each fixture. A second copy in the goals series could have drifted, and "the team's fifth match" would then mean two matches. A test asserts the two charts' match numbers are equal. |
| One TASO match selection | `teamLeagueMatches`, extracted from `getTeamFormSeries`, used by both services | The rule, table groups only with pass-through included and match lists excluded, is one decision (specs/031 Q2), so it has one implementation. |
| One series, two panels | `goalsSeries` returns `rolling` and `totals` together; `rollingGoalsPanel` and `totalGoalsPanel` each draw one | Both come from one pass over the same matches, so one loader. An empty `rolling` is the too-few state and an empty `totals` the no-matches state, which keeps the union to `ok`, `unavailable` and `error`. |
| Rolling from totals | Each window's goals are the difference of two running totals | Arithmetic that cannot disagree with the totals beside it, rather than a second summation. |
| A season with nothing stored | `ok` with both series empty: both messages | The league exists and has no matches yet, which is what `Kaudella ei ole vielä pelattuja otteluita.` says. `unavailable` stays for a team that played only in match lists. |
| `LineChart` series | `series: LineSeries[]` replaces `points`; position and form pass one series | A list, not a special second prop, so a chart with one line and a chart with two are the same code. The single-series charts' tests pass unchanged, which is the evidence they draw as before. |
| Telling lines apart | A `6 4` dash, one colour, and `LineLegend` beneath: a sample of each style beside its label, `aria-hidden` | Q5. The sample is decoration; the label is what a screen reader reads, and the text alternative lists both values anyway. |
| A value above the fixed top | Drawn at the top edge by `GoalsChart`, true value in the text row | Q3a. `LineChart` stays a plain plotter; the clipping belongs to the one chart with a fixed top. |
| Running-total ticks | One on every ten | Found in the first screenshot: stepping by twenty past sixty put `60` and `70` side by side. The most goals in the stored top-tier seasons was 99, so an axis to 100 has eleven labels, which the chart's height holds. |
| The decimal formatter | `formatDecimal` in `line-chart.tsx`, used by the form and rolling goals charts | It was `formatForm` in the form chart; a second chart needing it is the reason to share it. |

## What the tests prove, and how

- **`TM` and `PM`** three ways: the pure function against `calculateStandings`,
  each service against the real standings functions, and end to end against the
  standings page.
- **The same matches as the form chart**: the match numbers are compared in the
  pure tests, in the football-data service, and end to end.
- **The request budget**: one read for football-data and the position chart's
  two for TASO, with no provider request.
- **Thirteen mutations**, all caught: always reading the home side, a window off
  by one, rolling points from the first match, no clipping, a solid conceded
  line, no ten-goal floor, ticks every twenty, the dash not drawn, a solid legend
  sample, hiding the section when one chart is missing, no no-matches message,
  an empty season reported as an error, and fewer rolling ticks.

## Left open, deliberately

- **The rolling axis's evidence has no La Liga, Serie A or Ligue 1 season**, as
  the spec records; none is stored. If one is added and a five-match average
  passes 5, it is drawn at the top edge.
