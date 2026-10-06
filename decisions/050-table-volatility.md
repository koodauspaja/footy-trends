# 050 — Table volatility: decisions

Implementation notes for `specs/050-table-volatility.md` (#342). The spec says
what the panel shows; this says how, and where the implementation had to decide
something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `table-volatility.ts`, pure: which competitions (S10), the halfway round (S7), the movement between two tables over the teams in both (S6, S12), a single-table season, and the line (S9, S11) | Every rule is unit-tested without a database; the services only read and hand over tables. |
| Where the tables come from | football-data: `calculateStandings` with exactly `getStandings({ round })`'s arguments. TASO: `ownCalculatedStandings` over the season classified by `buildGroup`, its rounds renumbered by `withContinuedRoundNumbering` | S1: a position here is the standings page's for that round. The e2e recomputes one season from the page's own tables at halfway and at the end, and gets the panel's figure. |
| TASO's split and pool rules | Extracted from the team page's position chart into `leaguePath`, which both now call | specs/030's rules B, C and E — the regular group, a continuation combined only when verified, the groups ranked above, each pool its own league — are one function rather than two copies that could disagree. The chart's existing tests pass unchanged. |
| The read | One stored read per provider of every season before the season in progress (S3, S16); TASO's group rows in a second, parallel read | `getSyncedSeasonMatches` asks the provider for a season with nothing stored, which S4 rules out. A TASO row counts only under the pair the registry names for its season, as specs/048 and 049 read. |
| R | The highest numbered round in the team's regular group and its continuation | S7: every round a team plays in the league season. After `withContinuedRoundNumbering` a continuation's rounds follow the regular season's, so Veikkausliiga's 22 + 5 gives 27 and halfway is round 14. |
| A season that cannot be measured | `null` — left out and counted — when any team's regular season has no per-round table, its continuation does not reconcile, or no round is numbered | S9. One team's season without a comparable final position makes the season's mean something other than the spec's measure, so the season is left out rather than averaged over the rest. |
| A match with no round | Not in the halfway table; in the final one | The spec's edge case and specs/003: it is in no per-round table, but the standings page counts it. |
| The y-axis | From 0 to the next whole place above the highest season, ticked by place, at least one place tall | The spec's "from 0". |
| The caption | `LineChart` breaks a y caption onto two lines when it is longer than the plot is tall at a phone's font, at the space nearest its middle | `Sijoitusmuutos keskimäärin` ran off both ends of the drawing at 375 px. The agreed string is kept; every earlier caption fits and renders as before. |
| Tables calculated once | `seasonMovementFrom` memoises each group's table per round | Every team asks for the same few tables; a split season's offset needs the regular season's final table once per team otherwise. |
| The panel's place | In `Kausi kaudelta` after `Maaleja ottelua kohden`, loaded in parallel with the section's other reads, after the gate | S5, and specs/048's S4. |

## What the tests prove, and how

- **Thirty-four mutations, all caught**:
  - In the rules: the competition list, the halfway rounding, the absolute value, a team in one table, a season without rounds, a match with no round at halfway, an empty season, the two-season minimum, the axis floor, the left-out count and the order.
  - In the TASO read: each way a season becomes unmeasurable, the continuation's rounds in R, the offset below the upper group, the season's own pair, the renumbering and the group rows.
  - In the reads' completed-season filters, the provider dispatch and its failure path, and in the panel and the caption.
- **Four first survived**, and each fixture gap was closed. A match with no round now changes the halfway order if it is wrongly counted there. A two-round continuation moves halfway from round 2 to 3, which is what dropping either the continuation or the renumbering would undo. And the lower group is won by the team whose final place needs the offset.
- **The halfway and final positions are checked against the standings page itself**: in unit tests, against `getSeasonStandings` for a split season and a single-table one; in the e2e, against the page's own tables for one Premier League season.
- **The integration tests use codes no provider issues and future seasons**, so a read that spans a competition's history sees only its own rows: the season in progress left out, a cup's match under the same category left out.

## Verified against local data

The Premier League and Veikkausliiga signed in, at 375 px in light and dark and at
1280 px: three Premier League seasons of 20 teams, the selected season ringed;
Veikkausliiga with two seasons left out and the line saying so; the Champions
League without the panel; Kakkonen showing the too-few message.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso-standings-service.ts` at `a86c1cb` by #531.

- **`LeaguePath`.** Shared by the team page's position chart and the
  competition page's table movement, so the two cannot place a team
  differently.
- **`getTasoSeasonMovements`.** Never `getSyncedSeasonMatches`, which asks TASO
  for a season with nothing stored. Each season is kept to its own
  `(competition_id, category_id)` pair, and the rounds are renumbered as the
  standings page's are, so every table is the page's own.

Cut from `src/components/charts/line-chart.tsx` at `a86c1cb` by #531.

- **`captionLines`.** `Sijoitusmuutos keskimäärin` ran off both ends of the
  drawing at 375 px. A caption with no space stays whole.
