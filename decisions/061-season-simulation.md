# 061 — Season simulation: decisions

Implementation notes for `specs/061-season-simulation.md` (#347). The spec
says what is simulated and shown, and carries the figures the model was chosen
on (its Measured section); this says how, and where the implementation had to
decide something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `season-simulation.ts`, pure: which match is a remaining fixture, a table's runs and ranking, the settled places, and which tables of a season are simulated | As specs/053 to 057: every rule is unit-tested without a database. `season-simulation-service.ts` reads the tables, the fixtures and the fit, and caches. |
| The generator | mulberry32, seeded with the constant 61 | S2. Small, fast, and the same on every machine; `Math.random` cannot be seeded. The seed is the spec's number and means nothing. |
| A run's ranking | Points, then the team's place in the current table, which is its index in the rows given | S4. The current table is already in its order, so no goal difference is carried into the simulation. It understates goal-difference swings: a team level on points with one above it never passes it, though in a real season it would whenever its goal difference ended the better. Drawing scorelines measured no better over 72 season cuts (the spec's Measured). |
| A settled place | Two bounds per team: the best it can do (it wins everything, nobody else gains a point) and the worst (it loses everything, everyone else wins all of theirs), each ranked with the same tie rule | S9, S18. Both bounds flatter the open case: other teams' fixtures are against each other, so not all of them can win or lose at once. A place can therefore be decided in fact and still read `< 1 %` or `> 99 %`, never the other way round. |
| A chance | `{ share, settled }`; a settled share is exactly 0 or 1, and only `chanceText` decides how it prints | One function turns a figure into text, for all four columns. |
| `< 1 %` and `> 99 %` | Below 0,01 and from 0,995 up, unless settled; a share no run reached is `< 1 %` too | S9, S18. 0,994 rounds to `99 %`, and 0,995 would round to a hundred. |
| A remaining fixture (S13) | `isRemainingFixture`: not `FINISHED`, not `CANCELLED`, `AWARDED` or `Abandoned`, and neither side the placeholder | One rule for both providers. A status nobody has seen yet counts as to be played, which is S13's wording. |
| football-data's table | Computed from the season's `REGULAR_SEASON` matches with `calculateStandings`, as the page computes its own; a match stored without a stage counts as the league's own | S14. The page's table counts every stage. The two differ only once a play-off match is finished, and by then no regular-season fixture is left to simulate. |
| The season's read, football-data | `getLeagueSeasonMatches`, which is the standings page's own cached read under a name | S16. One read per request shared with the page; a stale season is refreshed on the page's own rule. |
| The season's read, TASO | `getSeasonTables`: `classifySeasonGroups`' groups with each one's own matches and its parent group | S16. The classification is the page's, so a group is simulated exactly when the page shows our table for it. |
| A group that has been continued | Not shown: after a split the regular season's teams are all in its continuation groups | S5 says each group's stored fixtures; the regular season's table would otherwise stand beside them with every place settled. |
| One table or several | One when the season has one table-keeping group, own or pass-through; a match list is not counted | S8. A promotion play-off stored as a match list does not turn a single-table league into pools. |
| Before a split (S20) | `hasCarryOver` for the season before, and no stored group with a parent in this one | The carry-over configuration is what records that a season split. "The previous stored season" is read as the season before: a league missing a year is not a case any covered competition has. |
| A pass-through table | `simulated: false`; when no table of the season is ours, the line of S15 | S15. |
| A season with nothing stored | No panel | The no-fixtures line says matches have been played. Reached only before a new season's fixtures are published. |
| A competition the fit has no match of | No panel | Spec, Edge Cases. `predictPoisson` cannot predict there. |
| A fixture the model cannot predict | Left out of the run | `predictPoisson` answers null only for a placeholder side or a missing competition, and both are excluded before it is asked. |
| Which competitions | `hasTableVolatility`, the league set of specs/050 | S6 names that set. A second list of leagues would be a second source of truth. |
| The cache | `forecast:v1:<provider>:<code>:<season>`, 15 minutes, through `getCachedUnlessDegraded` | S10. A forecast made from stored rows the provider could not refresh is shown and not kept, as the standings do not keep theirs. |
| A failed read | The service throws inside the cache's fetcher, so nothing is cached, logs `Unable to simulate the season` with the provider, the code and the season, and answers `error` | S22. One line, whichever read failed; the fit's own failure is also logged by its service. |
| The gate | `CompetitionAnalyticsSection`'s own, before the forecast is read | S11. Signed out, the service is never called. |
| The panel's place | First in `Tämä kausi`, drawn only when the service answers something other than `unavailable` | S7. A finished season's `Tämä kausi` holds the surprises alone, as before. |
| The table | `DataTable`, a table per simulated group under an `h5` with the group's name; a single-table season's one table is not named | The panel's heading is an `h4`. Below its floor the table scrolls sideways, as every table on the site does. |
| The link (S21) | `qualityHref(kind, "backtest", code)` and `Ennuste`'s `QUALITY_LINK` string | The address and the words the match page already uses. |

## Where this differs from the spec

| The spec | Built | Why |
|---|---|---|
| "The current table: as the standings page computes it" | football-data's is computed from regular-season matches only | S14 says a match of another stage is not in the table. See above: the difference cannot be seen while a fixture remains. |
| "A group with no fixture left while another has: shown" | Shown, except a group that has been continued | Its teams are in the continuation groups. |
