# 413 — League-position points where the team did not play: decisions

Chore #413 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/charts/line-chart.tsx` at `a86c1cb` by #531.

- **`ChartPoint.open`.** For the position chart, a round the team sat out: its
  position is on the line, but it did not play for it.

Cut from `src/lib/position-series.ts` at `94397a8` by #531.

- **`PositionPoint.played`.** A round sat out is a bye, a match of the team's
  own still to come, or a round TASO numbered out of calendar order. The
  chart draws it as an open circle.

## Moved from comments, 2026-10-07

Cut from `tests/e2e/league-position.spec.ts` at `0fe724f` by #531.

- **Veikkausliiga 2026 in the open-point test.** KuPS's first two matches
  after the split are rounds 31 and 24.
