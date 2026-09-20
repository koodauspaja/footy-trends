# 034 — Clean sheets: decisions

Implementation notes for `specs/034-clean-sheets.md` (#334). The spec says what
the panel shows; this says how, and where the implementation had to decide
something the spec did not.

## The property everything serves

**The last point is the season's own clean-sheet rate**, over exactly the
matches the standings table counts. The text row carries the count as well as
the share (`34 % (13/38)`), so the two cannot disagree: the end-to-end test
checks the percentage against the count and the count against the standings
page's `O`, for Arsenal 2024/25 and for KuPS across Veikkausliiga 2026's split.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| A running share, not a window | `kept / matches so far` | Q2, measured: a five-match window of clean sheets takes six values and is 0 in a quarter of all windows, which reads as missing data. A running share moves smoothly and lands somewhere checkable. |
| The count travels with the share | `CleanSheetPoint` carries `kept` as well as `share` | `34 %` alone cannot be checked against anything. The text row prints both, and the tests compare them with each other. |
| Where it is computed | `cleanSheetSeries`, from the same matches and the same order as the other result charts (`teamMatchesInOrder`) | "The team's fifth match" already means one thing across four panels; this is the fifth. |
| The services | One thin function per provider, as specs/032's and specs/033's | The TASO one goes through `teamLeagueMatches`, so league format, pass-through tables and the playoff exclusion are decided in one place. |
| The y-axis | Fixed 0–100 % | A share has a known range, so seasons are comparable and no season stretches the axis. |
| `percentText` moved to `line-chart.tsx` | Shared with `Koti- ja vierastilastot` | A second chart printing percentages is the reason to share it, as `formatDecimal` was shared for the second chart printing decimals. |
| Rounding | The share is rounded for display only | `1/3` prints as `33 %` while the count says `(1/3)`. The stored value stays exact, so the chart's geometry does not inherit the rounding. |

## What the tests prove, and how

- **The running share**, three ways: the pure function against
  `calculateStandings`' own row; each service against the real standings
  functions; and end to end against the standings page's `O`.
- **The request budget**: one read for football-data and the position chart's
  two for TASO, with no provider request.
- **Eight mutations**, all caught: counting goals scored instead of conceded,
  counting a one-goal game as a clean sheet, printing a count rather than a
  share, halving the axis, dropping the count behind the share, drawing a chart
  before the first match, leaving the panel out of the section, and reporting an
  empty season as an error.

## Left open, deliberately

- **Clean sheets home and away** would fit `Koti- ja vierastilastot` as a fifth
  row rather than as a chart of its own; not in this issue's scope.
- **Clean sheets by season** belongs to #426, the across-seasons placeholder.
