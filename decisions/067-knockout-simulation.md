# 067 — Knockout simulation: decisions

Implementation notes for `specs/067-knockout-simulation.md` (#517). The spec
says what is shown; this says how, and where the build had to decide something
the spec did not. It builds on decisions/061 (the league simulation, its runs,
seed and rounding) and decisions/059 (cup predictions). The feature ships in two
pull requests: this record's first part, the engine and the Champions League;
the Suomen Cups after it.

## Agreed before the build

Asked in chat on 2026-10-21, each answered with the recommended option:

| # | Question | Decision |
|---|---|---|
| A1 | What makes a cup side unrated, for S16's tie figures and S10's stand-in | **Absent from the Poisson fit**, which is what `predictPoisson` already refuses, rather than Elo's `isRated` that the spec's API table names. The figures come from the Poisson simulation, and the match page shows a Poisson `Ennuste` exactly when the fit knows both sides. The two differ only for a side whose last league match is more than 1 500 days old |
| A2 | S10's "the teams of M2 (or N1) in their latest season in the fit" | **The teams of that division's most recent season in the fit**, averaged |
| A3 | One pull request or several | **Two, stacked**: the engine and the Champions League, then the Suomen Cups |
| A4 | The one change to decisions/061's `simulateTable` | **An optional `onRun(order, random)`**, told each run's final order and handed the generator, so the knockout plays on from the same run's league phase with the same random stream |

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `knockout-simulation.ts`, pure: a tie's legs, extra time and penalties, UEFA's draw and tree, each run's rounds and the figures; `knockout-simulation-service.ts` reads the season, the fit and the stored ties, and caches | As decisions/061: every rule unit-tested without a database |
| One stream for both phases (A4) | `forecastChampionsLeague` calls `simulateTable` with the league phase's three zones and an `onRun` that plays the knockout from that run's order | The zone figures and the knockout chances then come from the same 10 000 runs. Without `onRun` the league simulation draws, ranks and counts exactly as before; its tests pass unchanged |
| A tie's draw | Each leg's **goal difference**, from the scoreline grid's cells summed along each diagonal; the aggregate is the sum of the differences | No away-goals rule (S8, decisions/014), so a tie is decided by the difference alone. Twenty-one numbers to draw from instead of a hundred and twenty-one cells |
| Drawing a difference | A uniform number against the cumulative shares, by halving | One `random()` a leg, as decisions/061 draws one a fixture |
| A neutral ground (S14) | The mean of the two orientations' difference shares, from the first side's view | The spec's "mean of both orientations' grids": a difference is the grid summed, so the mean of the sums is the sum of the mean |
| Extra time (S8) | `scoreGrid(homeGoals / 3, awayGoals / 3, 1)` at the last leg's ground, or neutral in a final; level again, `random() < 0.5` gives it to the first side | The spec: a third of the expected goals on the plain grid, then even odds |
| Each pairing's odds | Worked out once, the first time a leg or an extra time of it is drawn, kept by ground and by side | A leg is drawn hundreds of thousands of times. Keyed by strings, the first draft spent a third of its time building keys |
| A stored round | Used when the provider holds every pairing of it between two known sides: 8 play-offs, 8 last-16 ties, 4, 2, 1. Otherwise the round is drawn | S9: a stored pairing is used as it is. A part-stored round cannot be completed by UEFA's rules without knowing the rest, which the next refresh brings |
| A side not yet known | A tie with a side whose id is null or `PLACEHOLDER_TEAM_ID` is no pairing (S9), so its round is drawn | The spec asked how football-data stores such a fixture to be checked live first. On 2026-10-21 its 2026/27 season listed the 144 league-phase matches and no knockout fixture, so the shape could not be seen; both shapes are handled the same way |
| The play-offs and the last 16 (S9) | Sections as UEFA's pre-set bracket: play-offs 9/10–23/24, 11/12–21/22, 13/14–19/20, 15/16–17/18; the last 16 1/2 against section 15/16's winners, 3/4 against 13/14's, 5/6 against 11/12's, 7/8 against 9/10's; each seeded side meets one of its two at random | Wikipedia's 2025–26 knockout phase article, its "Predetermined pairings" and "Draw procedure": "the seeded teams in each section drawn against one of their two possible unseeded opponents". Read 2026-10-21 |
| The quarter- and semi-final path (S9) | In each half, the winner of the 1/2 tie meets the winner of the 7/8 tie and the 3/4 tie's the 5/6 tie's; the two winners meet in that half's semi-final. 1 and 2 are in opposite halves; one of 3/4, one of 5/6 and one of 7/8 is in each half, each at random | The same article: "Pairing 1: Winner A vs Winner D", "Pairing 2: Winner B vs Winner C", "the top two from the league phase could not meet until the final". It does not say how 3/4, 5/6 and 7/8 are split between the halves; S9's "at random within it" is the reading taken |
| A seed | A side's league-phase place, until it beats a side with a better one, whose seed it takes | The article: "Should a seeded team have been beaten, the team that eliminated them took over their seeding position." S9's "a winner taking the seed of the side it beat" |
| Which side hosts the second leg | The better seed, in every drawn two-legged tie | S14. The article: the better-ranked team plays the second leg at home "if they continued advancing", and an eliminator takes over the seeding position, so seed and venue agree |
| A stored tie's venues | As listed, a stored final too | S14: a stored fixture's listed home side is at home, as specs/059 S6 predicts a cup tie. A simulated final is at a neutral ground |
| Stored quarter-finals' halves | The provider holds no tree, so: the two 1/2–7/8 ties one each way, the two 3/4–5/6 ties one each way at random; always two ties a half | The same reading of S9. Read before any quarter-final is played, as a winner's seed changes when it beats a better one |
| Settled chances (S4) | A round is `100 %` when a stored tie has the side in it or a decided tie sent it there, or for the last 16 when the league phase has settled the side in its top eight; a side a decided tie put out, or one the league phase has settled in 25–36, leaves the table. Every other figure is the runs' share, which `chanceText` keeps off `0 %` and `100 %` | S4 and the spec's "a round already reached is 100 %; once a team is out, it leaves the table" |
| The order of the knockout table | The chance to win, then of each later round, then the league-phase table's order | The spec: "in the order of `Mestaruus`" |
| A tie's chance (S12) | Each stored, undecided tie the runs played, its home side's share of going through; the other side's is the rest | Only a tie the runs played has a figure, so a part-stored round, which is drawn, shows none |
| The league phase's columns | `Sijat 1–8`, `Sijat 9–24`, `Sijat 25–36`: each zone's label is its places, with no second line | The spec's headers. A league's zone column has a label and its places under it; here the label is the places |
| The panel's table | `ChanceTable`, the league forecast's table made generic over its rows; the league forecast renders through it, its markup unchanged | One table for both panels: the same widths, sticky names and rounding. The league panel's tests pass unchanged |
| Where the panel goes | `CompetitionAnalyticsSection` asks `getKnockoutForecast` beside `getSeasonForecast`; the Champions League's league forecast is `unavailable`, so the knockout panel takes its place, first in `Tämä kausi`, under `Kauden ennuste` | The spec's place. A league's knockout forecast is `unavailable` in turn, so a page never has both |
| The season's read | `getLeagueSeasonMatches`, the standings page's own cached read, which also says whether the refresh failed | As decisions/061's: a forecast made from stored rows the provider could not refresh is returned and not cached (`getCachedUnlessDegraded`) |
| An older format (S13) | `resolvePhaseShape` is `single`, a `LEAGUE_STAGE`, or no panel | Read from the data, never the year |
| The final played | `no-fixtures`, the league forecast's line | specs/061's string |
| A pairing the fit cannot predict | The run fails, with the panel's failure line and one `error` line | For the Champions League every known pairing has a prediction (specs/055 S4). One without would mean the fit treats the competition as a cup; inventing a figure for it would be worse than saying so |
| The cache | `knockout:v1:${kind}:${code}:${seasonId}`, 15 minutes; a forced refresh clears it beside the forecast's | S6. Cleared for every football-data competition, as the forecast's is: one key that is never there costs nothing |

## Measured

On a laptop, the engine alone, a 36-team league phase with 99 fixtures left and
no knockout stored, 10 000 runs: about 190 ms, of which the league phase is
about 37 ms (decisions/061's simulation) and the knockout the rest.
