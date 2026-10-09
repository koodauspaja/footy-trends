# 419 — The same fold marker on every fold: decisions

Chore #419 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/app/domestic/standings/page.tsx` at `ef7eb13` by #531.

- **`CupRoundSection`'s summary.** It shows the `FoldMarker` every fold
  shares.

Cut from `src/components/national-team-page.tsx` at `dc74e3e` by #531.

- **`YearSection`'s summary.** It shows the `FoldMarker` every fold shares.

Cut from `src/components/fold-marker.tsx` at `48ebab4` by #531.

- **`FoldMarker`.** Without it a fold shows only a pointer cursor, which a
  phone never shows at all. Its `<details>` carries `group`, and `group-open`
  turns the marker.

Cut from `src/components/team-page-fold.tsx` at `48ebab4` by #531.

- **`TeamPageFold`'s summary.** It shows the `FoldMarker` every fold
  shares.
