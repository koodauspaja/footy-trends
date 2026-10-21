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
| A1 | What makes a cup side unrated, for S16's tie figures and S10's stand-in | **Absent from the Poisson fit**, which is what `predictPoisson` already refuses, rather than Elo's `isRated` that the spec's API table named; the spec now says so. The figures come from the Poisson simulation, and the match page shows a Poisson `Ennuste` exactly when the fit knows both sides. The two differ only for a side whose last league match is more than 1 500 days old |
| A2 | S10's "the teams of M2 (or N1) in their latest season in the fit" | **The teams of that division's most recent season in the fit**, averaged |
| A3 | One pull request or several | **Two, stacked**: the engine and the Champions League, then the Suomen Cups |
| A4 | The one change to decisions/061's `simulateTable` | **An optional `onRun(order, random)`**, told each run's final order and handed the generator, so the knockout plays on from the same run's league phase with the same random stream |

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `knockout-simulation.ts`, pure: a tie's legs, extra time and penalties, UEFA's draw and tree, each run's rounds and the figures; `knockout-simulation-service.ts` reads the season, the fit and the stored ties, and caches | As decisions/061: every rule unit-tested without a database |
| One stream for both phases (A4) | `forecastChampionsLeague` calls `simulateTable` with the league phase's three zones and an `onRun` that plays the knockout from that run's order, a copy of it each run | The zone figures and the knockout chances then come from the same 10 000 runs. Without `onRun` the league simulation draws, ranks and counts exactly as before; its tests pass unchanged. The copy, so a caller keeping a run's order keeps that run's; Sourcery found the array was shared |
| A tie's draw | Each leg's **goal difference**, from the scoreline grid's cells summed along each diagonal; the aggregate is the sum of the differences | No away-goals rule (S8, decisions/014), so a tie is decided by the difference alone. Twenty-one numbers to draw from instead of a hundred and twenty-one cells |
| Drawing a difference | A uniform number against the cumulative shares, by halving | One `random()` a leg, as decisions/061 draws one a fixture |
| A neutral ground (S14) | The mean of the two orientations' difference shares, from the first side's view | The spec's "mean of both orientations' grids": a difference is the grid summed, so the mean of the sums is the sum of the mean |
| Extra time (S8) | `scoreGrid(homeGoals / 3, awayGoals / 3, 1)` at the last leg's ground, or neutral in a final; level again, `random() < 0.5` gives it to the first side | The spec: a third of the expected goals on the plain grid, then even odds |
| Each pairing's odds | Worked out once, the first time a leg or an extra time of it is drawn, kept by ground and by side | A leg is drawn hundreds of thousands of times. Keyed by strings, the first draft spent a third of its time building keys |
| A stored round | Used when the provider holds every pairing of it between two known sides, 8 play-offs, 8 last-16 ties, 4, 2, 1, each with both legs before the final. Otherwise the round is drawn | S9: a stored pairing is used as it is. A part-stored round cannot be completed by UEFA's rules without knowing the rest, which the next refresh brings. A tie stored without its return leg would otherwise be decided by its first leg alone; Sourcery found it |
| A leg's result | Finished, or `AWARDED` with a score; a `CANCELLED` or `Abandoned` leg is no leg of its tie, so the tie lacks one and its round is drawn | An awarded leg is settled. Read as unplayed, every run would replay it; a called-off leg would be played as though it were still to come. Sourcery found both |
| A tie settled by its scores | When the bracket names no winner but the tie has all its legs, two before the final and one in it, each with a settled score, and the aggregate is not level, the leader is through | `buildBracket` counts only finished legs, so an awarded final had no winner and the panel showed open chances instead of the no-fixtures line; Sourcery found it |
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
| The panel's table | `ChanceTable`, the league forecast's table made generic over its rows: the team's name its own first column, every column given to it with a width; the league forecast renders through it, its markup unchanged | One table for both panels: the same widths, sticky names and rounding. The league panel's tests pass unchanged. A column without a width would have made the table's least width `NaNpx`, which the type now rules out; Sourcery found it |
| Where the panel goes | `CompetitionAnalyticsSection` asks `getKnockoutForecast` beside `getSeasonForecast`; the Champions League's league forecast is `unavailable`, so the knockout panel takes its place, first in `Tämä kausi`, under `Kauden ennuste` | The spec's place. A league's knockout forecast is `unavailable` in turn, so a page never has both |
| The season's read | `getLeagueSeasonMatches`, the standings page's own cached read, which also says whether the refresh failed | As decisions/061's: a forecast made from stored rows the provider could not refresh is returned and not cached (`getCachedUnlessDegraded`) |
| An older format (S13) | `resolvePhaseShape` is `single`, a `LEAGUE_STAGE`, or no panel | Read from the data, never the year |
| The final played | `no-fixtures`, the league forecast's line | specs/061's string |
| A pairing the fit cannot predict | The run fails, with the panel's failure line and one `error` line | For the Champions League every known pairing has a prediction (specs/055 S4). One without would mean the fit treats the competition as a cup; inventing a figure for it would be worse than saying so |
| A fit that could not be read | The failure line, not cached, and no line of this service's own | `getPoissonFit` logs its own failure: thrown into this catch, one failure was two `error` lines, against the spec's one; Sourcery found it |
| The cache | `knockout:v1:${kind}:${code}:${seasonId}`, 15 minutes; a forced refresh clears it beside the forecast's | S6. Cleared for every football-data competition, as the forecast's is: one key that is never there costs nothing |

## Answered, not changed

| Finding (Sourcery, #689) | Why it stands |
|---|---|
| A forecast computed from the rows before a forced refresh can be written to the cache after the refresh clears it | decisions/029's two clears narrow the window but cannot shut it: a miss that began before the commit and ends after it stores the old figures for up to 15 minutes. The season forecast has the same window. Closing it means versioning the computed caches, which is its own change, for both forecasts at once |
| A decided tie in a round the simulation draws, because the round is stored only in part, is still settled: its loser out, its winner through | It is what happened. The runs redraw the round meanwhile, so the other sides' chances in it are approximate until the next refresh stores the rest, which is how a round comes to be stored in part |
| A forced refresh whose cache delete fails leaves the old forecast for up to 15 minutes | decisions/029's refresh, the same for every entry it clears: the table, the season forecast and this one |
| An `AWARDED` league-phase match is neither in the table nor simulated | The table is the standings page's own, which counts finished matches; the forecast agrees with the page beside it. Counting awarded matches is a change to the table, not to this feature |
| A match being played is drawn as a whole match, and the table counts finished ones only | decisions/061's rule (specs/061 S13), as the league forecast reads it, and the table beside the panel agrees |
| A tie whose return leg is not stored has its round drawn, its first leg's score with it | Deliberate: otherwise the first leg alone would decide it. football-data lists a tie's two legs together |
| Concurrent misses each compute, and an instance from before a deploy does not know this key | S6, as the season forecast: computed on a page view and cached for 15 minutes; both shared with every computed entry |
| A decided final with an unreadable fit shows the failure line, not the no-fixtures one | Both at once is needed; the line stands for at most the fit's 15 minutes, after the season's last match |
| An explicit `{ id: null }` side fails football-data's refresh | `normalizeMatch` rejects only an absent id: a bug for every competition, outside this feature, offered as one of its own |
| A forced refresh does not clear the Poisson fit's cache, so a forecast recomputed after it can use the old fit for up to 15 minutes | The same for the season forecast and the match page's `Ennuste` since decisions/055: the fit is the provider's, refitted every 15 minutes from every competition's matches. Clearing it from one competition's refresh is a change to that rule, not to this feature |

## What the tests prove, and how

- **The engine**, `tests/unit/lib/knockout-simulation.test.ts`: a tie by hand
  with odds that leave one outcome, the aggregate from each leg's home side, a
  played first leg, extra time at the last leg's ground, the shoot-out at even
  odds; a stored tie's legs counted from its first side; a neutral match as the
  mean of both grounds; extra time at a third of the goals on the plain grid.
  The draw under a model where the better place always wins, which makes every
  pairing S9 allows, and only those, appear: the play-offs' four sections, the
  last 16's, the quarter-final tree and 1 and 2 meeting only in the final. The
  venues under a model where the home side always wins, which sends every tie to
  extra time at the second leg's ground. Stored rounds used as they are, a part-
  stored one drawn, decided ties' losers out and winners through with the seed
  they beat, stored quarter-finals' halves, a stored side the table lacks. The
  figures: the top eight settled, 25 to 36 left out, the order, the league phase
  shown while it has a fixture left, each run's own league order, repeatability.
- **The service**, `tests/unit/lib/knockout-simulation-service.test.ts`: which
  seasons have a panel and what they read; the cache key and its 15 minutes; the
  league phase from its own matches only; the provider's verdict on a tie; the
  final played; the group-stage format; the fit without the competition; nothing
  stored; a stale read not kept; each failure's one `error` line.
- **The panel**, `knockout-forecast.test.tsx` and `competition-analytics.test.tsx`:
  both tables' headers and a row of each as printed, `Kierroksen parit` between
  them, the note and the link, the two lines; first in `Tämä kausi`, the failure
  line in its own panel, not asked for signed out or where `Analyysit` has none.
- **Mutations.** Each applied alone, the five test files run, and the source
  restored from a commit. 44 were caught; five survived the first tests and each
  now has one that fails without it (marked \*). One was equivalent and its code
  is gone: which half the best seed's quarter-final goes into, since the halves
  are only labels.

  | # | Mutation | Caught by |
  |---|---|---|
  | 1 | Extra time a whole match | `knockout-simulation.test.ts` |
  | 2 | A neutral ground read as the first side's | the same |
  | 3 | The shoot-out at 60–40 | the same |
  | 4 | No extra time | the same |
  | 5 | The worse seed hosting the second leg | the same |
  | 6, 7 | The play-offs' or the last 16's sections wrong | the same |
  | 8, 9 | The quarter-finals 1/2 against 3/4; 1 and 2 in one half | the same |
  | 10\* | A drawn tie's winner keeping its own seed | the same |
  | 11 | A part-stored round used | the same |
  | 12 | A decided stored tie played again | the same |
  | 13 | The top eight never settled | the same |
  | 14, 15 | A side put out, or one in 25–36, kept in the table | the same |
  | 16\* | The table not ordered | the same |
  | 17 | The league phase never shown | the same |
  | 18 | A tie's chance counted from its away side | the same |
  | 19\* | Stored quarter-finals' halves read after they are played | the same |
  | 20\* | A stored round's sides not the ones counted | the same |
  | 21 | `onRun` never called | the same, and `season-simulation.test.ts` passes either way |
  | 22–30 | The service keeping a placeholder's tie, scoring an unfinished leg, without `no-fixtures`, keeping the group-stage format, a knockout fixture\* counted in the league phase, caching a stale read, rewording its line, any season | `knockout-simulation-service.test.ts` |
  | 31–33 | The panel's tie sides swapped, no ties' list, no league-phase table | `knockout-forecast.test.tsx` |
  | 34 | The panel left out of `Tämä kausi` | `competition-analytics.test.tsx` |
  | 35–37 | A two-legged round taken without its return legs; an awarded leg replayed; every run handed one shared order | `knockout-simulation.test.ts`, `knockout-simulation-service.test.ts`, `season-simulation.test.ts` |
  | 38–41 | A called-off leg kept; a tie settled by its scores left without a winner; a level one given one; a failed fit logged again | `knockout-simulation-service.test.ts` |
  | 42 | A tie missing a leg read as decided by its scores | `knockout-simulation-service.test.ts` |
  | 43, 44 | The observer handed each run's order reversed; every goal difference drawn as 0, which fails 21 tests | `season-simulation.test.ts`, `knockout-simulation.test.ts` |

- **End to end**, `tests/e2e/knockout-simulation.spec.ts`, on the e2e
  database's 2026/27 season (45 of 144 league-phase matches played): the panel
  first in `Tämä kausi`, both tables' headers, 36 league-phase rows, every open
  chance a whole percent and never `0 %` or `100 %`, the note and the link; no
  panel for 2024/25, which is finished; nothing in a signed-out reader's HTML.
- **By eye**, screenshots of a production build at 375 px and 1 024 px, light
  and dark: neither page scrolls sideways, the tables scroll inside it with the
  names in view. The first screenshots showed `Neljännesvälierät` running into
  `Puolivälierät`: a round's column is now 136 px, and no header overflows its
  cell at either width.

## Measured

The engine alone, today's Champions League (the 2026/27 table and its 99
remaining league-phase fixtures, the test database's fit), 10 000 runs, nine
times each, bundled into one file that needs only Node:

| Where | 99 fixtures left | The league phase over |
|---|---|---|
| Laptop, Node 24.16.0 | 147 ms median, 167 ms slowest | 89 ms, 91 ms |
| Railway, staging's web container | To be measured | To be measured |

decisions/061 found Railway about twice the laptop. A miss is at most once per
competition per 15 minutes.

## Part 2: the Suomen Cups

The second pull request: the Miesten and Naisten Suomen Cup from their round of
16 (S15), and before it the ties between rated sides (S16). The first part's
decisions stand; these are the cups' own.

| Decision | Choice | Why |
|---|---|---|
| A cup's rounds | Each stored group of the season a round, in TASO's order; a match a tie of one leg at its listed home side's ground, TASO's `winner` its verdict (decisions/015), its score once `FINISHED` (`Played` or `Forfeited`). A side not yet known is no tie, and a called-off match (`Abandoned`, decisions/061's word for TASO's) is neither a tie nor a place in the round | S14 and the spec's "a tie TASO decided on penalties: read from its `winner`". The called-off match as part 1's leg; Sourcery found it |
| A round's size | Two sides a match, a side not yet known included | Counted from known sides only, a round of 32 with half its pairings unknown looked like a round of 16; Sourcery found it |
| The round of 16 (S15) | The first round of 16 sides or fewer, a power of two, with a side of the season's top division, and each later round that holds half as many or fewer. Simulated once every side of it is known; until then the cup is `before` it | The spec's rule. An early round of 16 with no top-division side is skipped. A side not yet known cannot be simulated |
| The top division's sides, and the stand-in's | Read from the stored rows only, `storedSeasonSides`, which never asks TASO | The standings page's own read refreshes a stale season from TASO. Through it, a cup page view would have asked for Veikkausliiga's and Kakkonen's seasons, against the spec's "no provider request of its own" |
| A drawn round | The sides left shuffled from the run's generator, paired in order, each tie one match at a neutral ground | S15: "drawn uniformly at random from the sides left, each tie a single match at a neutral ground" |
| A stored round | Each stored tie between two sides still in the run as it is; the sides no stored tie holds drawn against each other | Unlike UEFA's, a cup's draw has no rule a part-stored round would break, so its known pairings are kept and their figures shown. The first draft drew the whole round, and Sourcery found it |
| Settled chances | Every side of the round of 16 `100 %` in it; a decided tie's winner `100 %` in the next round, the round after the last stored one included, and its loser out of the table | S4. The tests found the round after the last stored one left unsettled in the first draft |
| An unrated side (A1, A2, S10) | In the simulation only, the mean of the fit's strengths over the stand-in division's sides in its most recent season with a side in the fit, looked for back to the fit's 1 500 days, six seasons with this one; with none, an average side | A2's reading. The fit reaches about four years back, so stopping after last season would not have been "most recent in the fit". No tie's `Ennuste` changes, since the fit is copied |
| The division line | While an unrated side is still in the table | The spec: "when a side left is unrated" |
| A tie's figure (S16) | A stored, undecided tie between two rated sides: from the round of 16 the runs' share; before it, in the current round, the latest with a tie undecided, each tie played on its own 10 000 times from the seed | A tie with an unrated side has no figure, as its match page has no `Ennuste` |
| A round's name | By the sides it holds: 16 `Neljännesvälierät`, 8 `Puolivälierät`, 4 `Välierät`, 2 `Loppuottelu` | specs/015's names. The forecast starts at the round of 16, so every round has one |
| Where the section goes | Its own `section` under `Cupin ennuste`, after `Pudotuspelit` (S11), only when the competition has a cup forecast and `canSeeAnalytics()`; no other standings page asks for it | S5 and S11. Cup pages stay without `Analyysit` |
| The final played | `no-fixtures` when the round counted from the round of 16 as the final holds a decided tie | Not whichever round came last: with one semi-final stored and played and the other's pairing unknown, the last round holds one decided tie and the cup is not over. The pre-push review found it |
| The cache | `knockout:v1:taso:${code}:${seasonId}`, 15 minutes; a forced refresh of any TASO competition clears it beside the forecast's key | As part 1 |
| A fit that could not be read | The failure line, not cached, with no line of its own | As part 1: `getPoissonFit` has logged it |

### What the tests prove, and how

- **The engine**, `knockout-simulation.test.ts`: under a model where the better
  place always wins, a drawn round can give any side left any other, and a
  stored one gives only its own pairings; a drawn tie is asked from both
  grounds and a stored one from its listed home side's; a part-stored round is
  drawn; a decided tie's loser out and its winner settled in the next round;
  every side's rounds and one winner a run; the order; each open tie's chance
  from its home side, none for a decided one; a tie on its own about half at
  even odds; repeatability.
- **The service**, `knockout-simulation-service.test.ts`: a match as a tie, a
  shoot-out from TASO's winner, an unplayed one, a placeholder; the round of 16
  found, an early 16 without a top-division side skipped, a round of 12
  skipped, nothing before it, the rounds after it; which competitions and
  seasons have a section and what they read; the ties before the round of 16
  between rated sides only; a stand-in for MSC and NSC, an unrated side played
  as the stand-in's strength, found four seasons back, looked for no further
  than six; no line once every unrated side is out; the final played; nothing
  stored; a played semi-final whose other is unknown, which is not the final;
  the fit without the cup; each failure's line, or none; a stale read
  not kept. `storedSeasonSides` in `taso-standings-service.test.ts`, and against
  Postgres in `tests/integration/taso.test.ts`.
- **The section**, `cup-forecast.test.tsx` and the standings page's test: the
  strings, the headers by round, a row as printed, the rounds left only, the
  ties after the table, the lines, before the round of 16, the two failure
  lines; after `Pudotuspelit`, signed in only.
- **Mutations**, applied alone and restored from a commit: 50, 48 caught. Two
  were equivalent, and their code is gone: a stop after the final, which a
  round that does not halve already makes, and the "before" filter's undecided
  check, which `tieChances` already makes.

  | # | Mutation | Caught by |
  |---|---|---|
  | 1–11 | A drawn round not shuffled, or played at the first side's ground; any part of a round used, or none; a decided tie's winner not settled, or its loser kept; the settled rounds sized by the stored ones; no order; a tie's chance from its away side; `tieChances` keeping a decided tie or counting the away side | `knockout-simulation.test.ts` |
  | 12–33 | TASO's winner reversed; a placeholder kept; an unplayed match scored; the round of 16 without its top-division, power-of-two or sixteen-or-fewer condition, or without halving; unrated ties kept, before the round of 16 or after; the line while every unrated side is out; the stand-in an average side, this season's only, a season less far back, or the top division; no final check; a failed fit logged; a stale read kept; an earlier season; a cup the fit lacks; the top division read as the stand-in | `knockout-simulation-service.test.ts` |
  | 34 | Stored sides read from the home side only | `taso-standings-service.test.ts` |
  | 35–39 | No division line; the ties before the table; the note before the round of 16; a round's column reading the next; a ties' heading with no tie | `cup-forecast.test.tsx` |
  | 40 | The section for a signed-out reader | `page.test.tsx` |
  | 41 | The last stored round read as the final | `knockout-simulation-service.test.ts` |
  | 42 | The stand-in written into the shared fit, which every `Ennuste` reads | `knockout-simulation-service.test.ts` |
  | 43, 44 | A stored tie kept with a side the run no longer has; a part-stored round drawn whole | `knockout-simulation.test.ts` |
  | 45–48 | A round sized by its known ties; a called-off match kept; a round of 16 forecast with a side unknown; every round's ties shown before it | `knockout-simulation-service.test.ts` |
  | 49 | The sides read in two queries | `taso-standings-service.test.ts` |
  | 50 | No round with a tie undecided, read as one | `knockout-simulation-service.test.ts` |

- **End to end**, `tests/e2e/cup-forecast.spec.ts`: the recorded cups are
  finished, so MSC 2026 is seeded, with eight league sides who have played each
  other and a round of 16 with four ties played (one on penalties), two to play
  between league sides and two with a side the fit does not know. The section
  right after `Pudotuspelit`; its headers; twelve sides, every cup chance never
  `0 %` or `100 %`; the two rated ties only; the note and Kakkonen's line; no
  `Analyysit` on the page; no section for 2025; nothing for a signed-out reader. The seeded rows go, so the
  next read of the season asks the stand-in again.
- **By eye**, at 375 px and 1 024 px, light and dark: the page never scrolls
  sideways (its scroll width equals the window's at both), the table scrolls
  inside it with the names in view.

### Measured

The cup engine alone from a round of 16, 10 000 runs, nine times:

| Where | From the round of 16 |
|---|---|
| Laptop, Node 24.16.0 | 54 ms median, 69 ms slowest |
| Railway, staging's web container | To be measured, with part 1's |
