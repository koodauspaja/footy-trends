# 049 — Home advantage and draw rate, compared across competitions: decisions

Implementation notes for `specs/049-home-advantage-and-draw-rate.md` (#339, with
#340 joined). The spec says what the panel shows; this says how, and where the
implementation had to decide something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `outcome-shares.ts`, pure: which seasons count (S8, S19), the shares and `Kotietu` (S5, S14), the order (S11, S17) and the seasons the S18 line names | The services only count, so every rule is unit-tested without a database, and the integration test only has to prove the SQL. |
| The read | One `GROUP BY` per provider, per competition-season, each count a `count(*) filter (where …)` | Four results and the matches left to play come from one pass over the rows. Grouping by season as well as competition is what lets S19 drop an unfinished season before anything is summed. |
| Which competitions | specs/048's list, now exported from `goals-per-game.ts` as `COMPETITIONS` | S6 compares exactly the competitions S5 names. One list means a league added to one panel is in both. |
| A shoot-out | football-data's `penalties_home`/`penalties_away` are subtracted before comparing, `coalesce`d to 0 where none is stored | S3. The stored score is the provider's `fullTime`, which includes a shoot-out; TASO's does not. #492 is the same correction for specs/048. |
| What "left to play" is | `SCHEDULED`, `TIMED`, `IN_PLAY`, `PAUSED`, `EXTRA_TIME`, `PENALTY_SHOOTOUT`, `LIVE`, and TASO's `Live` | S19 names scheduled, timed and in play. A postponed, suspended, cancelled, awarded or abandoned match is neither a result nor to be played, so it neither counts nor holds a season open. The stored statuses today are `FINISHED`, `SCHEDULED`, `TIMED`, `POSTPONED`, `AWARDED` and TASO's `Abandoned`. |
| An awarded match | football-data's `AWARDED` is not counted; a TASO forfeit is | S3 counts finished matches. An awarded 3–0 was not played to that score, so it says nothing about home advantage — but TASO's `Forfeited` is stored as `FINISHED` by design (specs/013: TASO's own tables count a walkover, and the standings must reconcile with them), and no column keeps the original status. Telling the two apart needs a stored status and a refetch, beyond this feature; it touches about 36 junior-league matches. |
| A season across two years | From the stored kickoffs: any match in a later calendar year than the season's own | S18 names the seasons of each kind. `spansCalendarYears` in `head-to-head.ts` decides by region, which would label Brazil's calendar-year Série A as `2024/25`, and a provider call per competition is what S19 exists to avoid. |
| The order | By `Kotietu` as printed, then by more matches | S11 and S17. Sorting on the unrounded value would put two rows that both read `+15` in an order the reader cannot see a reason for; the printed value makes S17's tie-break the one that decides. |
| TASO's competitions | One query over every category id of the ten, each row then filed under the competition whose registry pair it is | specs/048's rule: a renamed junior series is one row, and a cup published under the same category is nobody's. |
| A failed read | `OutcomeShares` carries `error`; either provider failing fails both | S15. The two reads run in parallel and one `catch` answers for both. |
| This competition's row | `DataTable` gains `isCurrentRow`: `aria-current="true"`, `bg-surface`, bold | The shade alone is faint in light mode; bold numbers carry it, and `aria-current` says it to a screen reader. |
| The S16 line | Above the table | It explains an absence before the reader looks for the row. |
| Loading | `getGoalsPerGame` and `getOutcomeShares` in parallel, after the gate | S4 of specs/048 still holds: signed out, neither runs. |
| At 375 px | The table scrolls sideways inside its own wrapper | The site's convention for every wide table, the standings and specs/044's averages included. The six columns need about 720 px. |

## What the tests prove, and how

- **Thirty-seven mutations, all caught.**
  - In the rules: the floor, the empty season, the unfinished season, `-0`, printed-value ordering and its tie-break, `Kotietu`'s subtraction, summed draws, the season-kind split and both ends of each range, and the naming registry.
  - In the SQL: both shoot-out corrections, the left-to-play count and two of its statuses, the season-kind flag, the score and status filters, and the win comparison.
  - In the component and table: the sign, the minus, a single-season range, the season kind, the empty line, own-row matching by provider, the S16 line, the failure message, the marking, a column, and the read itself.
- **Four first survived.** The fixtures gained a tie on the printed value with the decimals the other way round, draws summed across seasons, seasons out of order, and an awarded match with a score.
- **The integration test measures what its rows add.** The read spans every compared competition, which the other suites' fixtures share, so it compares counts before and after, in seasons 2030–2032 that nothing else stores.
- **The e2e asserts rules, not values** (#485): rows from both providers, exactly one marked and named as the page, the order by `Kotietu`, the group order, and no share in a signed-out page. Reversing the sort fails it.

## Verified against local data

Veikkausliiga and the Premier League signed in, at 375 px in light and dark and
at 1280 px: five competitions with completed seasons locally, from both
providers; the page's own row marked; `Kaudet 2025 ja 2023/24–2025/26, kaikki
tallennetut ottelut.` from the data; the rounding line under it.

## Moved from comments, 2026-10-06

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`getOutcomeShares`.** A partial table could rank a competition against
  only some of the others. One aggregate per provider, from the football-data
  plan floor on. Which seasons are completed is decided from the same rows,
  so no provider is asked for a current season.
