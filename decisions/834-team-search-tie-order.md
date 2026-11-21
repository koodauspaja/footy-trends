# 834 — Team search: teams whose newest matches kick off together, in one order: decisions

Bug #834, found while sweeping for #832's class of bug. `searchTeams` ordered
the teams it found by each one's newest match and nothing else, in two places:
each query's SQL cap at 20, and the in-memory merge of the four queries (both
providers, home and away).

## What was measured

The issue first said that both sides of one match, found by one search, came
back in no defined order. They do not: the home side comes from the
home-column query and the away side from the away-column query, the merge reads
the queries in a fixed order, and the sort is stable, so the home side was
always first. An order by accident, but a fixed one.

What no code promised was the order of two teams found by the same query whose
newest matches kick off together, for example two home sides in simultaneous
matches: that was whatever Postgres's sort returned. It was not seen to vary.
Nor was which teams of one kickoff a query's cap kept: on today's Postgres it
keeps the lowest ids, because `distinct on (team id)` hands the outer query its
rows in team-id order and the capped sort keeps the earliest of equal rows. The
integration test passes with or without the cap's new tie-break, so the unit
test's mock is what holds it: it orders rows of one kickoff by team id only when
the query asks it to, and keeps them in the order read otherwise.

## Decisions

| Decision | Why |
|---|---|
| Fixed rather than closed as not reproducible | Miikka, 2026-11-21: "Finish the fix". It makes the order a guarantee rather than an accident of query order and of Postgres's sort |
| Each query orders by kickoff, newest first, then team id before its `limit` | The cut at 20 is then the query's own order, not the planner's |
| The merge orders by kickoff, newest first, then source, then team id (`byNewestThenTeam`) | The four queries' hits from both providers meet here, and football-data's team ids are a separate space from TASO's (decisions/027), so the source breaks a tie before the id. `football-data` sorts before `taso` by name, an order with no meaning beyond being one |
| The cut per query still keeps every team the merge keeps | Within one source both orders agree. A team that ranks above another in one side's query has a newest match at least as new overall, so it ranks above it in the merge too. A team cut from one side's top 20 therefore has 20 teams above it in the merge, and would be cut there as well |

`decisions/832-cup-forecast-tie-order.md` gave four match lists the same kind of
tie-break by match id. A search hit has no match id, so the team id breaks the
tie here.
