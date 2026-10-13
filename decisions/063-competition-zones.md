# 063 — Competition zones per season: decisions

Implementation notes for `specs/063-competition-zones.md` (#518). The spec says
what a table position is shown to lead to and where; this says how, and where
the implementation had to decide something the spec did not.

## What TASO sends

Read once for Ykkösliiga and Veikkausliiga 2026 on 2026-10-13, before any code:

| Group | `next_stage_levels` | `next_stage_level_texts` |
|---|---|---|
| Ykkösliiga | `"1,1,6,0,1,1,0,0,0,0"` | `Nousee Veikkausliigaan`, `Jatkaa liigakarsintaan`, `Säilyy Ykkösliigassa`, `""`, `Karsii paikastaan Ykkösliigassa`, `Putoaa Ykköseen`, four `""` |
| Veikkausliiga, `Runkosarja` | `"6,6,0,0,0,0,0,0,0,0"` | `Mestaruussarjaan`, `Karsintasarjaan`, eight `""` |
| Veikkausliiga, `Mestaruussarja` | `"1,1,1,3,0,0,0,0,0,0"` | `Kultaa`, `Hopeaa`, `Pronssia`, seven `""` |
| Veikkausliiga, `Karsintasarja` | `"0,0,0,4,1,1,0,0,0,0"` | four `""`, `Liigakarsintaan`, `Ykkösliigaan`, four `""` |

The counts are one comma-separated string of ten; the labels are an array of
ten strings. A level keeps its place in the ten when the ones before it are
empty, so `Karsintasarja`'s levels are 4, 5 and 6.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| A level's stored number | TASO's own, 1 to 10, with gaps where a level has no count | It is the identity TASO gives it, and the order is the same. A running count would renumber a level when an earlier one gains a count |
| A level string that cannot be read | All or nothing: no level of that group, one `warn` line | S15, Miikka, 2026-10-13. A string is readable when it is exactly ten parts, each of digits only and no larger than an `integer` column |
| A group that publishes no counts | Nothing stored, no log line: the field missing or `""` | The spec's `warn` is for counts that cannot be read. A group that sends none is not a failure, and a line for each on every sync would be noise. The spec's Edge Cases has the row now |
| A label | Trimmed; empty, missing or not a string is no label | Spec, Edge Cases. The array is read by index, so a short one leaves the later levels unlabelled and not shifted |
| Where the levels are written | Inside `synchronizeGroupTeams`, which takes them as a required argument and replaces the season's levels in the transaction that replaces its rows | Agreed with Miikka before any code, 2026-10-13. Three callers write group rows; a second function beside the first is one a caller can forget, as #630 showed for a parallel path |
| Which competitions store levels | `publishesZones(categoryId)`, asked by the one writer, from `ZONE_COMPETITION_CODES` in `domestic-competitions.ts` | S4. The gate sits on the write path, so no caller and no later reader needs its own. For any other category the writer does not touch the table at all |
| Replacing | The season's levels are deleted and the snapshot's inserted, an upsert on category, competition, season, group and level, the first row of a pair kept | The team rows' own rule (decisions/013, decisions/196): a group missing from the snapshot loses its levels, and two syncs at once both succeed |
| A snapshot with no team rows | Its levels are still replaced | The levels are written before the early return for an empty snapshot |
| The forced refresh | `Snapshot` carries `groupLevels`; `writeSnapshot` passes them. They are not in `compare`, the diff, the hash or the audit | S10. A preview and its approval are unchanged by a level; the levels written are those of the answer fetched at approval |
| The existing backfill | Passes the levels with the rows; `--reset` also empties `taso_group_zones` | It writes group rows, so it is a caller like the others. A reset that left the levels would leave rows for seasons it had just deleted |
| Reading | `getSeasonStandings` reads the season's levels after the classification, in its own `try`, and returns them beside `groups` | Spec, API & Data: read with the group rows, no provider request, no cache. After the classification because its refresh is what writes them. A failed read is the page's own error, as the spec says: no new failure string |
| What is not touched | `classifySeasonGroups`, `buildGroup`, `getSeasonTables`, `GroupStandingsResult` | They are shared by the season simulation, the cups and the team pages. The levels ride on `SeasonStandingsResult`, which only the standings page reads |
| Positions from levels | `groupZones(levels, rowCount)` in `competition-zones.ts`, pure: zones as first and last position, and the positions a rule follows | A zone is a labelled level; an unlabelled one is counted and not named. Cut at the last row; rows past the counts have none |
| Where the rule goes | Under the last row of every level that another row follows, labelled or not, the rows past the counts included | S16, Miikka, 2026-10-13 |
| A group with no labelled level on its table | No rule and no list, also when it has unlabelled levels | Spec, UX / UI. A rule nothing names would be a line no one can read |
| A position | The row's place in the table as drawn, counted from 1, not the `position` the row carries | S8, and a pass-through table's own order. `StandingsTable` takes `ruleAfter` as places and gives `DataTable` the row's index |
| The rule itself | `border-b-2` in the `muted` colour, in place of the row's own `border-border-subtle border-b` | S6: heavier, no new colour. `--border` against `--border-subtle` is too faint to read as a level; `muted` is a theme token, so it holds in light and dark |
| `DataTable` | One optional prop, `hasRuleBelow(row, index)`. Without it every row's class is what it was | Seven components draw through it. A test holds the class string of a row that is not asked for a rule |
| The page | `LeagueGroups` in the standings page: each league group's section with its list under the table, and the source line under the last group that has a list | Spec, UX / UI. Only the league branch: a cup stores no level, and neither cup layout passes any |
| The backfill command | `npm run backfill -- --zones`, in the existing entry point | It reuses the guard that takes `DATABASE_URL` from the command line only. Refused beside `--reset` or `--refetch` (`zonesConflict`), which rewrite or delete the tables it must leave alone |
| The backfill's work | `backfillZones` in `src/lib/zone-backfill.ts`, with the pacer and the reporter passed in; the script adds the output and the cleanup | So it is imported by tests and run against Postgres, where `scripts/backfill-run.ts` is read from its source |
| Which seasons it asks for | `storedTasoSeasons` of the five competitions, newest first | Spec: every stored season. No season discovery is needed, so there is no request beyond one a season |
| Its pace | One request every three seconds, `ZONE_BACKFILL_PER_MINUTE` | Spec, Performance: as the sweep that measured TASO was spaced |
| Written, skipped, failed | Written: levels stored. Skipped: TASO answered and there was no level to store, and what was stored for the season is cleared. Failed: the request failed or the answer had no groups, and nothing is written | Agreed with Miikka, 2026-10-13. No groups for a season we hold rows for is not an answer about its levels |
| A re-run | Asks every season again | About 50 requests. Keeping track of what a run had done would be a second source of truth for a one-off |
| The run's exit code | 1 when a season failed | A release step that has to be run again should say so |

## Where this departs from the spec

- **S10's reason has changed.** The spec chose a levels-only backfill because a
  refetch of a finished season was unsafe while #628 was open. #628 merged in
  #630, and `--refetch` now carries the starting points. The levels-only
  backfill stays for what it costs and leaves alone: about 50 requests where a
  refetch is a full run of both providers, and no team row is rewritten. The
  spec's S10 says so now.
- **The spec was corrected in this pull request** where two of its rows
  disagreed (S15), where a reading was settled (S16), and where it now names
  the command, the wire shape and the log line's counts.
- **`Unreadable TASO zone levels` can be logged for a competition outside S4.**
  The line is written where the string is read, in `taso.ts`, which cannot ask
  the registry without an import cycle. Nothing is stored for such a
  competition either way.
- **A forced refresh logs the line twice** for an unreadable group: once at
  the preview and once at the approval, as each reads TASO.

## The release step

`npm run backfill -- --zones` is run once in each environment after
`create_taso_group_zones` has deployed. Until then the season being played
shows its zones from its next sync, and finished seasons show none.
`docs/infrastructure.md` and `docs/setup/022-production-backfill.md` say so.

## What is not solved

- **A finished season whose levels TASO changes later** keeps what is stored,
  as its rows do, until a forced refresh or another `--zones` run.
- **A season TASO answers `500` for** (three of 63 on 2026-10-12) has no zones
  until a run reads it.
