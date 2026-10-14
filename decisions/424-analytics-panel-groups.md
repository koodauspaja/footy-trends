# 424 — The Analyysit panels are grouped: decisions

Chore #424 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/analytics-section.tsx` at `ef7eb13` by #531.

- **The groups in `AnalyticsSection`.** `Tämä kausi verrattuna` and
  `Ennätykset` each cover position, points and goals at once, so a subject
  grouping would have needed a non-subject group anyway. `Nollapelit` sits in
  the first group and `Koti- ja vierastilastot` at the head of the second,
  which swapped the two against the order before: a running share plotted
  match by match and a season summary belong on opposite sides of that
  line.

Cut from `src/components/charts/chart-panel.tsx` at `48ebab4` by #531.

- **`ChartPanel`'s `h4`.** `Analyysit` is the `h2`, a group is the `h3`, and
  a panel is below both. Every use of the component is a panel in a group, so
  the level is fixed and not passed in by ten callers that would all pass the
  same thing.
