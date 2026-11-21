# 832 — A cup round's ties in a defined order: decisions

Bug #832. The `Cupin ennuste` panel listed a round's ties in whatever order the
season's rows were read in. A refresh gives TASO's order, and stored rows come
back ordered only by `updated_at desc` (`loadSeasonMatches` in `taso-sync.ts`).
Rows with the same `updated_at` have no defined order. The e2e test seeds every
row with the same `updated_at` to within a millisecond, so it failed when 7–8's
row got a later millisecond than 4–5's.

| Decision | Why |
|---|---|
| `cupRound` sorts a round's matches by kickoff, then TASO's match id | Miikka, 2026-11-21: define the order rather than not promise one. The page lists a round's matches by kickoff (`selectGroupMatches`). The match id breaks the tie a round played on one evening has |
| The order is defined in `cupRound`, not in the read | `loadSeasonMatches` serves every caller of the season's rows, and on a refresh it returns TASO's rows without reading them back. Sorting where the round is built covers both paths, and changes no other caller |
| `byKickoffThenId` from `national-team.ts` is reused | It is the same comparator, generic over the two fields, with no imports of its own |
| The figures are repeatable too, not only the list | Stored ties are played in list order, so they take the seeded random draws in that order. Before this, the same stored round could give slightly different percentages depending on how it was read |

decisions/067-knockout-simulation.md still describes a cup's rounds as each
stored group, in TASO's order. That is the order of the rounds, which this
does not change. The ties within a round are now in the order above.
