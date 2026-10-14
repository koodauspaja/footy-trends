# 644 — A stored TASO table behind the stored results: decisions

Notes for #644, a bug. `specs/013-more-finnish-competitions.md` has the rule
this narrows: a group shows our own table when it reproduces TASO's points,
and TASO's numbers when it does not.

## What was wrong

TASO's server answered `getCategory` with `500` for Veikkausliiga and
Kansallinen Liiga 2026, measured on 2026-10-14. A failed refresh falls back to
the stored group rows, and in production those were written on 2026-09-29.
The matches stayed current, refreshed by the hourly predictions run. So every
2026 split group of Veikkausliiga compared our table, from matches up to date,
with TASO's from three weeks earlier, found them different, and showed TASO's
old numbers with the notice that they differ from the results.

Cloudflare made it harder to see: an edge that still held a copy served it as
`STALE`, about 48 hours old, so the same request answered `200` from one
machine and `500` from another. #639's measurement, of a table counting 26
matches where the results had 27, was most likely that copy.

## The design

Agreed with Miikka on 2026-10-14 ("ok, do 644 as suggested"), with two
conditions added during the work (below).

A stored table is **only behind** our results when, for every team it ranks:

- its `matches_played` is known, and no more than ours;
- a team level with us on matches has our points, and a team behind has no
  more points than ours;
- and at least one team is behind.

Then the group is shown as our own table, with the stored starting points.
Ours counts a team's finished matches in the group and in its configured
parent, which is how TASO counts them (measured on every finished season of
the six league competitions on 2026-10-14). Anything else is the comparison of
specs/013, unchanged.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| How "behind" is told | By match counts, not timestamps | A stored match's `updated_at` changes on every sync, and its kickoff comes before its result, so neither says when a result arrived. TASO's own count is in the row |
| What is counted | A team's finished matches in the group and its configured parent | TASO's `matches_played` in a continuation includes the regular season, seeded or not (Measured) |
| A continuation with no carry-over entry | TASO's numbers, as before | Its count includes the parent and ours does not, so it reads as ahead of ours. Ours would also be calculated without the parent |
| Points of a team behind | No more than ours | Fewer matches cannot have earned more. Added during the work: without it, #628's tests of a table with points ours does not reach showed ours |
| Points of a team level with us | Exactly ours | A deduction or a corrected result beside a team that is behind is TASO's to show. This is the comparison the issue's idea made |
| A table at zero | decisions/628's rule alone | It is also "behind", but #628 asks more of it: a configured carry-over. Added during the work: without it, an unplayed continuation with no entry showed ours, calculated without its parent |
| Calculable | As decisions/628 has it for a configured group; always for a group with no entry | A seeded group without its seeds would count its own matches alone |
| Cups | Never "behind" | A groups-and-playoff cup's table is in TASO's published order (decisions/043), which ours cannot stand in for |
| Where the rule lives | `isBehindResults`, asked by `buildGroup`; `reproducesTasoPoints` takes whether ours stands in, unplayed or behind | One rule for every reader of a group's kind. #628's unplayed check moved from `reproducesTasoPoints` to `buildGroup` beside it |
| What the page says | Nothing new | Miikka, 2026-10-14. The table shown is right for the stored results, and the failed refresh is already logged as an `error` |
| #639 | Covered by this, and closed when it merges | A table TASO publishes late is behind in the same way. The stronger check specs/064 drafted, replaying each team's matches, cannot apply to a stored copy weeks old |

## Every reader

All take a group's kind from `classifySeasonGroups`. For a group whose stored
table is behind:

| Reader | Now |
|---|---|
| The standings page | Our table with its form column, and no notice |
| The round selector | The group's rounds are offered |
| `Sijoitus kierroksittain` | Continues through the split |
| `Kauden ennuste` | Simulated, not named as left out |
| Table movement, finished seasons | Compared as any season; none is stored behind (Measured) |
| Result charts, cups, foreign leagues | Unchanged |

## What is not solved

- **TASO's server still fails.** The stored rows stay as they were until a
  refresh succeeds; only how they are compared changes. So do the zones of
  specs/063 for those two competitions.
- **A deduction TASO adds after the stored copy was made** is not in our table
  until a refresh succeeds.
- **A team behind whose TASO points are lower than they should be** for its
  count (a deduction landing with a match) still shows ours without it. Only a
  replay of each team's matches could tell, and a weeks-old copy has nothing to
  replay against.

## What the tests prove, and how

- No end-to-end test: the seeded 2017 season is shared by several end-to-end
  specs, and a group behind its results there would change what they count.
  The rule is held through `getSeasonStandings` in unit tests and against
  Postgres.

## Measured

On 2026-10-14, read-only on production, from inside the production container,
and from a laptop:

| | |
|---|---|
| `getCategory` VL 2026 | `500` from production; from the laptop `200` from Cloudflare's `STALE` copy (`age` 174 378 s), and `500` past the cache |
| `getCategory` NL 2026 | `500` past the cache |
| `getCategory` M1L and M1 2026, `getMatches` VL 2026 | `200` |
| Production's 2026 group rows | Written 2026-09-29, 17:42 to 18:01 UTC; ten rows since |
| Production's `Mestaruussarja` | 25 matches a team stored; 27 in the results; 26 or 27 in TASO's stale copy |
| How TASO counts in a continuation | The parent's matches with the group's, in every finished season of VL, M1, M1L, M2, NL and N1 |
