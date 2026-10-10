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

## Moved from comments, 2026-10-06

Cut from `src/components/charts/line-chart.tsx` at `a86c1cb` by #531.

- **`formatDecimal`.** One decimal is exact for averages over five matches,
  which move in fifths; a season's average takes two (`2,11`). `toFixed` also
  hides floating point: `0.2 × 3` is `0.6000000000000001`.
- **`MARGIN`.** `bottom` and `left` carry the axis labels: 56 keeps the x-tick
  row clear of the axis caption, and 72 fits a three-digit y tick (the
  clean-sheet share axis runs to 100) beside the rotated caption. `MARGIN` is
  JavaScript, so it cannot answer the breakpoint the way the font does; both
  gutters are sized for the larger text and cost a few units of plot at every
  width.
- **`AXIS_TEXT`.** `text-xs` is 12 user units, not 12 screen pixels, and SVG
  has no non-scaling equivalent for text. At 640 units shown on a 375-px
  phone the drawing is about 0,54x, so 12 units reached the reader at roughly
  6 px. Enlarging the font below `sm` fixes that without narrowing the
  drawing, which would have cost the desktop canvas.

Cut from `src/components/charts/bar-chart.tsx` at `ef7eb13` by #531.

- **`bar-chart.tsx`.** Built beside `LineChart` and in the same way: no
  client JavaScript, geometry in exported functions tested directly, theme
  tokens only. A row is a measure and measures do not share units (points
  per match, goals per match, a percentage), so each bar sits on a faint
  track the length of its row's scale, which makes the scale visible. Its
  value is printed just past the track, in one column for every bar: easier
  to scan than text at each bar's own end, and never over the track's faint
  fill, so the chart reads exactly without an axis. Filled or outlined, both
  in the foreground colour, with `BarLegend` to name them.
- **`WIDTH`.** Narrower than `LineChart`'s 640, and shown no wider than
  `max-w-md`: the text is most of the content, and it scales with the
  drawing. At 400 units a phone's width shows it at about 0,86× and a desktop
  at about 1,1×; at 640 a phone would show it at about half size. `LineChart`
  reached the same end differently: its text is the axis and not the
  content, so it kept its width and enlarges the font below `sm`.
- **`barLength`.** A value past the scale fills the track and no more, and
  its printed text still states the true number. A negative value cannot
  occur in these measures.

Cut from `src/lib/home-away.ts` at `48ebab4` by #531.

- **`home-away.ts`.** Counted over exactly the matches the form and goals
  charts count; the services pass them in.

Cut from `src/components/charts/home-away-chart.tsx` at `48ebab4` by #531.

- **The goals scale in `MEASURES`.** No stored top-tier side reached 4 goals a
  match over a season; 3,12 was the most.
