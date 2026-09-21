# 033 — Home vs away: decisions

Implementation notes for `specs/033-home-vs-away.md` (#329). The spec says what
the panel shows; this says how, and where the implementation had to decide
something the spec did not.

## The property everything serves

**Home and away add up to the standings table's row.** Home matches plus away
matches is `O`, and likewise `TM`, `PM` and `P`. Checked against
`calculateStandings`, the real `getStandings` and `getSeasonStandings`, and end to
end against the standings page for Arsenal 2024/25 and for KuPS across
Veikkausliiga 2026's split. End to end, the panel's two-decimal values times each
side's match count, summed and rounded, give the table's own figures. Rounding
is safe because each side is off by less than 0,005 × 19.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| What the series holds | Raw counts per side (matches, won, drawn, lost, scored, conceded); the four measures derived from them | Counts are what add up to the table, so they are what the tests check. The measures are one division each, and `null` for a side with no match (Q7), so a `–` can never be confused with a real 0. |
| Which matches | `teamLeagueMatches` for TASO, the season's finished matches for football-data | Exactly the form and goals charts' matches, from the same cached reads; no read added. |
| `BarChart` as its own component | Beside `LineChart`, not a mode of it | Bars share nothing with lines but the SVG. Rows each carry their own scale, since the measures do not share units. |
| The printed values | One column just past the tracks, not at each bar's own end | Found while building it. A column scans in one glance down the rows, and it keeps text off the track's faint fill, where contrast is weakest. The spec was updated to say so. |
| Every bar on a track | A faint `fill-border-subtle` rectangle the length of the row's scale | With a different scale per row and no axis, the track is what shows how far a bar could go. |
| Width | 400 units, shown no wider than `max-w-md` | Found in the first phone screenshot. The text is most of this chart's content and scales with the drawing, so at `LineChart`'s 640 a 375-px phone showed labels at about half size. At 400 it is about 0,86× on a phone and 1,1× on desktop. The line charts share the underlying issue on phones; that is left for its own change. |
| Outlined bars | Inset by half the stroke on every side | An SVG stroke is centred on the edge, so an outline the bar's full size would spill past the track. |
| Keys | Each bar has a `name` (`home`, `away`) | The same reason as `LineSeries.name` on #417: never a position in the list. |
| Win % text | A whole percent with a no-break space before `%` | Finnish writes `63 %`, and a no-break space keeps the number and its sign on one line. |
| Two decimals | `formatDecimal` gains a `digits` argument, default 1 | A season average does not move in fifths, as the rolling ones did (Q5). |

## What the tests prove, and how

- **The sums**, three ways: the pure function against `calculateStandings`, each
  service against the real standings functions, and end to end against the
  standings page, for a football-data team and a TASO team across a split.
- **The request budget**: one read for football-data and the position chart's
  two for TASO, no provider request.
- **Fourteen mutations**, all caught: home counted as away, a draw as a win, a
  side with no match as 0, win share not as a percentage, a bar past its track,
  a negative bar, away filled, a breakable space before `%`, `0` instead of `–`,
  one decimal, a chart before the first match, the panel not shown, an empty
  season as an error, and a bar drawn for a missing value.

## Left open, deliberately

- **The line charts' text is small on a phone**, for the same reason this chart
  was narrowed. Changing their width changes every line chart, which is not this
  issue's scope.

  **Closed 2026-09-21 by #441**, and not the way this row assumed. Narrowing the
  line charts would have cost the desktop canvas, so their axis font is enlarged
  below `sm` instead — the text is inside the `viewBox`, so a breakpoint reaches
  it even though `MARGIN` is JavaScript and cannot follow. `BarChart` keeps the
  400 units decided here.
