# 416 — The team page's match list and Analyysit fold away: decisions

Chore #416 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/team-page-fold.tsx` at `48ebab4` by #531.

- **`TeamPageFold`.** `<details>` and not client-side state, as the
  Huuhkajat years and the cup rounds use, and open by default for the same
  reason: nothing is hidden until the reader chooses to hide it. Resetting on
  every load, a season change included, is the accepted cost of keeping no
  state. As a named region, a screen reader can move between the parts of
  the page whether they are folded or not.
