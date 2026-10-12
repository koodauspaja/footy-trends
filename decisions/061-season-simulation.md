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
| One table or several | One when the season has one table-keeping group, own or pass-through; a match list is not counted, and a group that has been continued is | S8. A promotion play-off stored as a match list does not turn a single-table league into pools. A season that has split is several even when one group continues it, as Kansallinen Liiga's `Mestaruussarja` does: six teams, where top three and bottom three are one figure. The local review before the first push read this as a defect; it is the rule, and a test now says so. |
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
| The table | Its own small fixed-width table, not `DataTable`: the points column 72 px, a chance column 76 px (96 px in a single table and before a split, whose headings are longer), the team's name what is left and never under 112 px | `DataTable`'s name column has a 240 px floor, which at 375 px left only the expected points on screen; seen in the first screenshot, as specs/053 found for `Ennuste`. First and last place now fit a phone (336 px of its 343). A single table's five columns need 472 px and scroll sideways there, inside the panel. Fixed widths, so a season's tables line up. |
| A table's name | An `h5` with the group's name above each table of several, and before a split; a single-table season's one table is not named | The panel's heading is an `h4`, and a league's one table is the page's own. |
| The link (S21) | `qualityHref(kind, "backtest", code)` and `Ennuste`'s `QUALITY_LINK` string | The address and the words the match page already uses. |

## Where this differs from the spec

| The spec | Built | Why |
|---|---|---|
| "The current table: as the standings page computes it" | football-data's is computed from regular-season matches only | S14 says a match of another stage is not in the table. See above: the difference cannot be seen while a fixture remains. |
| "A group with no fixture left while another has: shown" | Shown, except a group that has been continued | Its teams are in the continuation groups. |

## What the tests prove, and how

- **Every mutation below was caught**, one row each, so the count is the
  table's length. Each was run against the unit test file of the module it
  changes.

  | # | Mutation |
  |---|---|
  | 1 | The run count changed |
  | 2 | The seed changed |
  | 3 | A cancelled match still to be played |
  | 4 | An awarded match still to be played |
  | 5 | An abandoned match still to be played |
  | 6 | A finished match still to be played |
  | 7 | A placeholder home side played |
  | 8 | A placeholder away side played |
  | 9 | A home win's points to the away side |
  | 10 | A home win worth two |
  | 11 | A draw worth nothing to the away side |
  | 12 | A draw worth nothing to the home side |
  | 13 | An away win's points to the home side |
  | 14 | Draws never drawn |
  | 15 | Ties to the later team in the table |
  | 16 | Ranked by points ascending |
  | 17 | The bounds' tie to the later team |
  | 18 | The bounds without their tie rule |
  | 19 | An impossible place never settled |
  | 20 | A decided place never settled |
  | 21 | The most a team can reach counted at two a win |
  | 22 | First place judged on the worst case only |
  | 23 | First place judged on the best case only |
  | 24 | Last place's bounds swapped |
  | 25 | The top three as the top two, in the runs |
  | 26 | The top three as the top two, in the bounds |
  | 27 | The bottom three as the bottom two, in the runs |
  | 28 | The bottom three as the bottom two, in the bounds |
  | 29 | Last place counted one place up |
  | 30 | Expected points from the current table |
  | 31 | A fixture's home side taken for both |
  | 32 | First place the title in every table |
  | 33 | First place the title only by the group's name |
  | 34 | The title group under another name |
  | 35 | No table of ours answered as nothing left |
  | 36 | Nothing left when any one table is finished |
  | 37 | A table that is not ours simulated |
  | 38 | The model asked with the sides swapped |
  | 39 | The layout not passed on |
  | 40 | A finished season given a forecast |
  | 41 | A competition that is not a league given one |
  | 42 | The cache's lifetime changed |
  | 43 | The cache key without its season |
  | 44 | The cache key without its provider |
  | 45 | The cache key without its competition |
  | 46 | Play-off matches in the table and the fixtures |
  | 47 | A match without a stage left out |
  | 48 | A failed read with nothing stored answered as no panel |
  | 49 | A stale forecast kept in the cache |
  | 50 | A fresh forecast never kept |
  | 51 | football-data's fixtures of every status |
  | 52 | football-data's table from every match |
  | 53 | A fixture's sides swapped |
  | 54 | TASO's failed read answered as no panel |
  | 55 | The domestic season read under last season's ids |
  | 56 | The continued group kept |
  | 57 | A match list counted as a table |
  | 58 | Before a split whatever this season holds |
  | 59 | Before a split whatever last season did |
  | 60 | Last season's split looked up under this season |
  | 61 | One table of two called a single table |
  | 62 | A pass-through table simulated |
  | 63 | TASO's fixtures of every status |
  | 64 | A failed fit answered from nothing |
  | 65 | A competition missing from the fit simulated |
  | 66 | The other provider's fit |
  | 67 | The fit asked about another competition |
  | 68 | The failure not logged |
  | 69 | The failure logged without its season |
  | 70 | The failure logged without its provider |
  | 71 | A failure answered as no panel |
  | 72 | Less than one percent from half a percent down |
  | 73 | More than 99 from 99 up |
  | 74 | A settled place printed as an open one |
  | 75 | An open place printed as a settled one |
  | 76 | The bottom three column reading the top three |
  | 77 | The top three column reading the bottom three |
  | 78 | The last-place column reading first place |
  | 79 | Mestaruus in every table |
  | 80 | Sarjan voitto in every table |
  | 81 | Before a split shown as several tables |
  | 82 | Several tables shown as one |
  | 83 | A single table named |
  | 84 | Group names never shown |
  | 85 | The regular-season line on every forecast |
  | 86 | The regular-season line never shown |
  | 87 | The link without its address |
  | 88 | The failure line for nothing left |
  | 89 | The not-simulated line dropped |
  | 90 | Expected points to no decimal |
  | 91 | First and last place too wide for a phone |
  | 92 | The team's name without a floor |
  | 93 | The table without its sideways scroll |
  | 94 | The table without its minimum width |
  | 95 | The note dropped |
  | 96 | The forecast panel drawn where there is none |
  | 97 | The forecast asked with the seasons swapped |
  | 98 | The link to the live report |
  | 99 | The link without its competition |
  | 100 | A group given every group's matches |
  | 101 | A group without its parent |
  | 102 | Every season called a split one |
  | 103 | No season called a split one |
  | 104 | One table or several counted after the continued group is dropped |

- **Two first survived and were closed with a test**: the bottom three counted
  as the bottom two in the runs (27: every bottom-three figure asserted was a
  settled one, which the bounds decide; an open place is now asserted), and a
  failed fit not thrown (64: reading the missing fit threw anyway, so the
  failure was still reported; the log's error is now asserted to name the read
  that failed, for all three).
- **Integration**, against Postgres, the cache passed through: a foreign
  league's season with a postponed fixture, a cancelled one and two play-off
  matches, where only the regular season's fixtures add points; a domestic
  season of two pools, one with a fixture left and an abandoned match and one
  finished; and the same season with TASO's points disagreeing for one pool,
  which is then left out.
- **End to end**, on the Premier League's real season in progress: the panel
  first in `Tämä kausi`, the standings page's own teams in its order, a figure
  in every cell, and the link landing on `/ennusteet` for the competition; a
  finished season with no panel; signed out, no heading and no figure in the
  HTML. Between seasons the test accepts the no-fixtures line instead of a
  table. It drops the cached fit and forecast once the seasons are stored: on
  a fresh database the fit can have been cached before any Premier League
  match was.

## Measured

The figures the model and the tie rule were chosen on are in the spec's
Measured section. On a server from this branch against the test database,
which holds a part of the history, with real fixtures from both providers, on
2026-10-12:

| Page | What it showed |
|---|---|
| Premier League, 2026/27 | One table of twenty, `Mestaruus`, top three and bottom three; a bottom-three chance of `> 99 %` beside ones of `< 1 %` |
| The Championship | One table of twenty-four |
| Veikkausliiga, after its split | `Mestaruussarja` with `Mestaruus`, `Karsintasarja` with `Sarjan voitto`, each with `Sarjan viimeinen sija`; the regular season's own table not shown; in `Karsintasarja`, with one round left, four teams at `0 %` to win it |
| Ykkönen, after its split | `Ylempi jatkosarja` and `Alempi jatkosarja`, both `Sarjan voitto`; first and last place already decided in each, `100 %` and `0 %` |
| Kakkonen | The no-fixtures line |
| A finished season of any of them | No panel |

Screenshots at 375 px and 1 280 px, light and dark. At 375 px the page does
not scroll sideways on any of them; the first version's table did, inside the
panel, and is described above.

**The simulation as shipped**, `simulateTable` alone on a laptop, 10 000 runs,
the median of nine:

| Table | Fixtures | Time |
|---|---|---|
| 24 teams, the Championship on 2026-10-12 | 446 | 98 ms |
| 24 teams, its whole season | 552 | 117 ms |
| 20 teams | 321 | 73 ms |
| 6 teams, a split group | 17 | 5 ms |

A miss also reads the season, which the page has read already, and the
provider's fit, which is cached for the match pages (a cold fit 122 ms,
decisions/055). It happens at most once per league per 15 minutes.
