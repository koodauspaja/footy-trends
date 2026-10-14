# 498 — A match list prints the score as the match page does: decisions

Bug #498 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/match-list-table.tsx` at `dc74e3e` by #531.

- **The score in a match list.** The stored score includes a shoot-out,
  which printed `4–5` for a 1–1.
- **`formatScore` in the list.** One match reads one way on every page.
