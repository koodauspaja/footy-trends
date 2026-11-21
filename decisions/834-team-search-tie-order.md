# 834 — Team search: teams whose newest matches kick off together, in one order: decisions

Bug #834, found while sweeping for #832's class of bug. `searchTeams` ordered
the teams it found by each one's newest match and nothing else, in two places:
each query's SQL cap at 20, and the in-memory merge of the four queries. Both
sides of one match share its kickoff, so a search finding both had no defined
order between them. Past 20 hits at one kickoff, which 20 a query kept was
also undefined.

| Decision | Why |
|---|---|
| Each query orders by kickoff, newest first, then team id before its `limit` | The cut at 20 is then the same on every search of the same rows |
| The merge orders by kickoff, newest first, then source, then team id (`byNewestThenTeam`) | The four queries' hits from both providers meet here, and a team id means a different team in each provider (decisions/027), so the source breaks a tie before the id. `football-data` sorts before `taso` by name, an order with no meaning beyond being one |
| The cut per query still keeps every team the merge keeps | Within one source both orders agree. A team that ranks above another in one side's query has a newest match at least as new overall, so it ranks above it in the merge too. A team cut from one side's top 20 therefore has 20 teams above it in the merge, and would be cut there as well |

`decisions/832-cup-forecast-tie-order.md` gave four match lists the same kind of
tie-break by match id. A search hit has no match id, so the team id breaks the
tie here.
