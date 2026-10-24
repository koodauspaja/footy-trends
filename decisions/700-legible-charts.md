# 700 — Charts legible on a phone, at their reading width: decisions

Chore #700. Measured on 2026-10-24 in Chromium on the e2e stand-in. At 375 px
every chart's smallest text painted at 10.2 px (the line charts) or 10.3 px (the
bar charts), and Helmarit's `Maalit yhteensä` printed sixteen y labels, 0 to 150
in tens. The issue's "about 7 px" was read from screenshots. How to fix it was
left to the work, as agreed on the issue on 2026-10-24.

| Decision | Why |
|---|---|
| Below `sm` the line charts' text is 23 units and the bar charts' 14. From `sm` up it stays 12. On a 375 px screen both paint at about 12 px (12.3 and 12.0 measured) | The text is inside the `viewBox`, so a phone scales it with the drawing: 640 units to 343 px is 0.54×, 400 units 0.86×. This overrides the 19-unit phone size behind decisions/441's "The sizes in `chart-axis-text.spec.ts`" |
| Fewer ticks rather than smaller type. The running totals step by 10, 20, 25, 50, 100 and so on, so their axis prints seven labels at most, and their top is a whole step. The x labels' phone thinning reads the larger size, and now hides as many labels as it takes, not only every other: twelve `2015/16` seasons keep every third | Sixteen labels down a 244-unit plot overlap at 23 units. This overrides decisions/032's "One on every ten", whose reason was an axis to 100. Rounding the top to a whole step keeps its other reason: `60` and `70` side by side came from a top that was not one |
| The gutters grow with the text: bottom 56 → 60, the tick row 18 → 22 units under the axis, the note row 22 → 28. The left gutter is no longer a constant: it holds the caption, a gap, then the widest y tick and its own gap, never less than 80 | `MARGIN` is JavaScript and cannot answer a breakpoint, so it is sized for the phone's text. The Elo chart's four-digit ratings take about 95 units, a three-digit axis about 81. The line chart's tests hold each gap against the size read from the class |
| Three label clashes on a phone are fixed in the drawing's geometry. The rotated y caption moves in from x 12 to 18, so its ascent stays inside the drawing. A caption that wraps adds a line, 28 units, to the left gutter, so its second line clears the y ticks. The plot starts far enough in for the first x label to clear the y ticks' ends, wherever its tick sits, as a wide last label already ends it early. It never starts past its middle, and a tick at the domain's end, which would move with it, leaves it alone | The first and the last were there at 19 units too, seen on main the same day: the caption cut at the edge, and `2023/24` printed over `2,5`. At 23 units they were worse, and the wrap is new: `Maaleja / ottelu` wraps where a note row shortens the plot |
| At 1 024 px the charts keep their widths: the line charts `max-w-2xl` (672 px) and the bar charts `max-w-md` (448 px), in a 960 px column | The drawing scales whole, height and text with it. At 960 px a 2:1 line chart would stand 480 px tall with 18 px labels, and a bar chart would scale 2.4× and put each value about 826 px from its label. The line charts leave 30 % of the column empty, under the issue's third. The bar charts leave more than half, for the reason decisions/033 gives for their width: the text is most of their content |

## After

Measured the same way after the change: every chart on Arsenal's 2024/25 team page,
Helmarit's page and the Premier League 2024/25 standings paints its smallest
text at 12.3 px (line) or 12.0 px (bar) at 375 px, and at 12.6 px or 13.4 px at
1 024 px. Helmarit's totals read 0 to 150 in steps of 25.
