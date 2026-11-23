# 832 — Matches that kick off together, in a defined order: decisions

Bug #832. The `Cupin ennuste` panel listed a round's ties in whatever order the
season's rows were read in. A refresh gives TASO's order, and stored rows come
back ordered only by `updated_at desc` (`loadSeasonMatches` in `taso-sync.ts`).
Rows with the same `updated_at` have no defined order. The e2e test seeds every
row with the same `updated_at` to within a millisecond, so it failed when 7–8's
row got a later millisecond than 4–5's. Four match lists had the same gap, and
take the same fix.

| Decision | Why |
|---|---|
| `cupRound` sorts a round's matches by kickoff, then TASO's match id | Miikka, 2026-11-21: define the order rather than not promise one. The page lists a round's matches by kickoff (`selectGroupMatches`). The match id breaks the tie a round played on one evening has |
| The order is defined in `cupRound`, not in the read | `loadSeasonMatches` serves every caller of the season's rows, and on a refresh it returns TASO's rows without reading them back. Sorting where the round is built covers both paths, and changes no other caller |
| The figures are repeatable too, not only the list | Stored ties are played in list order, so they take the seeded random draws in that order. Before this, the same stored round could give slightly different percentages depending on how it was read |
| Four match lists get the same tie-break: a TASO group's match list (`selectGroupMatches`), a TASO season's match list (`getSeasonMatchList`), a football-data round (`getRoundMatches`) and a cup stage's matches page (`renderCupMatches`) | Miikka, 2026-11-21: "i want it fixed", then "All four lists". Each sorted by kickoff only, from a read ordered by `updated_at desc` (football-data's `getSyncedSeasonMatches` too), so matches kicking off together could swap places between page loads. A cup round on one evening, or a Champions League night with many matches at 21:00, has them |
| The other sorts by kickoff alone are left as they are | Each was read: the current round's and stage's pick (`resolveCurrentRound`, `resolveCurrentStage`) take only the earliest match's round; a tie's legs (`buildTie`) and a combined knockout's three matches (`splitCombinedKnockout`) never share a kickoff; one team's own matches (`selectTeamMatches`, `upcomingFirst`, the form) cannot; the backtest takes matches kicking off together as one group |
| `byKickoffThenId` moves from `national-team.ts` to `matches/match-order.ts` | It was the national-team pages' comparator, generic over the two fields. With six callers it sits with the other match-order helper, and its tests move with it |

decisions/067-knockout-simulation.md still describes a cup's rounds as each
stored group, in TASO's order. That is the order of the rounds, which this
does not change. The ties within a round are now in the order above.
