# 628 — A table TASO serves as unplayed: decisions

Notes for #628, a bug. `specs/013-more-finnish-competitions.md` has the rule
this corrects: a group shows our own table when it reproduces TASO's points,
and TASO's numbers when it does not.

## What was wrong

TASO can serve a continuation group's published table as zeros: every team at
0 matches played and 0 points, the teams and their order kept. Our
calculation, from the stored matches, cannot equal that, so the group was
shown as TASO's numbers: a table of zeros with no round selector, and a
position chart that stopped at the split.

It showed on 2026-10-12, when the release run of v1.15.0, which starts from an
empty database, failed on the end-to-end test of a Kakkonen pool through its
split. #631 moved that test to a season TASO returns complete; this is the bug
behind it.

## The design

Everything in a table comes from the matches, except the starting points: a
deduction, a qualifying bonus, or the total a seeded split group begins from.
Those exist only in TASO's rows. So:

1. **Reading.** A table TASO reports as unplayed is nothing to compare our
   calculation with. Where ours can be calculated, the group shows ours.
2. **Storing.** When a snapshot brings a group back unplayed, it is written as
   it comes, with the starting points stored for each team put back.

Nothing else is kept from the stored rows, so nothing in them can go stale.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| What counts as unplayed | `isUnplayedTable`: points reported for some team, and no team with a match played or a point; a null counted as none. Starting points are not asked about | It is what TASO serves, measured below. A knockout group, whose rows report no points at all, is not a table |
| Where our own table can stand in | `calculableWithoutTaso`: the group's carry-over is configured, and every team has what its row is calculated from. In a seeded group that is a non-zero starting point; in an unseeded one, stored matches in the parent group | A seeded group starts from TASO's starting points, and a zero cannot be told from one TASO has zeroed, so it counts as missing. An unseeded group is calculated from its own matches and its parent's, so a team whose regular season is not stored would be counted from the split alone. Either way the group is left as TASO's rows, never shown as a table of ours that is short. A group with no entry may be a continuation calculated without its parent |
| A group with no carry-over entry | TASO's rows, as before | No regular-season group has been seen unplayed, and an unconfigured continuation cannot be told from one |
| The teams in an unplayed table | Every team it lists must be in our table, a team with no points reported included; otherwise TASO's rows | Ours is built from the matches and would drop a team that has none. A table with figures is checked as it always was, on the teams TASO gives points to |
| Where the rule lives | `reproducesTasoPoints`, the one function that compares | No second rule decides how a group renders |
| What the sync carries | The stored starting point of a team, into its row of a group the snapshot reports as unplayed, where the snapshot's own is zero or missing | Miikka, 2026-10-13, after the second review: "make just design/advanced engineer decisions and go on". The earlier attempt kept whole stored rows; their points and match counts went stale as soon as another round was played |
| A snapshot's own starting points | They win: only a zero is filled from what is stored | A changed deduction or seed is TASO's to say |
| A group with figures in the snapshot | Written as it comes, starting points included | A deduction lifted while the table has figures is TASO's answer |
| Who carries | The page's own refresh and the backfill | Both replace rows with nobody shown what changes. A `--refetch` over every season would otherwise zero the starting points of every table TASO serves unplayed today |
| Who does not | An administrator's forced refresh | Miikka, 2026-10-12: "i think the admin update should have the season data refetched, i think that was why it was done". It shows a diff and writes exactly that. It is also the way to clear a carried starting point TASO has truly lifted |
| What is decided from | The snapshot reduced to one row per team and group, the same rows that are written | TASO lists a team twice in some groups, and the first row is the one stored |
| When the sync reads before it writes | Only when the snapshot has an unplayed group, and only that group's rows | The common sync is unchanged: one delete, one insert |
| An empty snapshot, or a group missing from it | Replaces what was stored, as before | It is an answer. Starting points are carried into a group that comes back, not kept for one that does not |
| Two syncs of a season at once | Not serialised, as before (decisions/196) | Each ends with one whole snapshot. A carried starting point is read from committed rows, so the worst case is the one that existed already: the older snapshot written last |
| The end-to-end tests | Not changed | #631 and #636 moved the tests that read a live table to settled seasons. The rules here are proved by the unit tests and against Postgres |

## Every caller, and every state

| Caller | What it does now |
|---|---|
| The page's refresh (`getSyncedGroupTeams`) | Carries. One more read when a group comes back unplayed |
| The backfill (`scripts/backfill-run.ts`) | Carries, in its own transaction |
| The forced refresh (`force-refresh.ts`) | Unchanged: replaces, inside its own transaction, with no read |

| Stored for the group | The snapshot's group | Stored afterwards | The page shows |
|---|---|---|---|
| Nothing | Figures | The snapshot | Ours where it reproduces TASO's, as before |
| Nothing | Unplayed | The snapshot, at zero | Ours for a configured unseeded group; TASO's zeros for a seeded one or one with no entry |
| Figures | Unplayed, page or backfill | Zeros, with the stored starting points | Ours for a configured group, seeded or not, current with the matches |
| Figures | Unplayed, forced refresh | Zeros | As the row for nothing stored |
| Zeros with carried starting points | Unplayed again | The same | The same |
| Zeros with carried starting points | Figures | The snapshot | Ours where it reproduces TASO's |
| Anything | Figures and its own starting points | The snapshot | As before |
| Anything | Missing, or the snapshot empty | Nothing | A match list or no group, as before |
| Rows with no points at all (a knockout group) | The same | The snapshot | A match list, as before |

## What is not solved

- **A deduction never seen.** A configured unseeded group that the database
  first reads when it is already unplayed is shown as ours without any
  deduction it had. Production holds six groups with a deduction of 2 or 3
  points.
- **A starting point TASO truly lifts while a group has no match played** is
  carried all the same. A forced refresh clears it.
- **A seeded group whose starting points were already replaced by zeros**,
  before this change or by a forced refresh, has nothing left to carry. It
  keeps TASO's rows, as before, until TASO serves the table again.
- **An unplayed table served as nulls, not zeros,** has not been seen and is
  not handled: it is taken as a group with no table.
- **A table that trails its own results** during a season is a different
  thing: the app shows TASO's numbers for it, as specs/013 has it, and it
  rights itself when TASO does.

## What this overrides

| Earlier record | What it said | Now |
|---|---|---|
| `decisions/013-more-finnish-competitions.md`, `buildGroup` | A group whose result does not reconcile with TASO's points renders `pass-through` | Unless TASO's table for it is unplayed and ours can be calculated without it |
| `decisions/013-more-finnish-competitions.md`, the group rows | A sync replaces the season's stored rows with the snapshot | The page's refresh and the backfill put stored starting points back into a group that comes back unplayed |

## What the tests prove, and how

- **Every mutation below was caught**, one row each:

  | # | Mutation |
  |---|---|
  | 1 | The reading rule never applies |
  | 2 | One unplayed row is enough |
  | 3 | Matches played ignored |
  | 4 | Points ignored |
  | 5 | The rule not consulted by `reproducesTasoPoints` |
  | 6 | An unplayed table excusing a team our table lacks |
  | 7 | An unranked listed team not checked on an unplayed table |
  | 8 | Every table checked on all its rows |
  | 9 | A group with no carry-over entry trusted |
  | 10 | A seeded group without its starting points trusted |
  | 11 | A seeded group trusted with one team's starting point missing |
  | 12 | A seeded group never trusted |
  | 13 | An unseeded group trusted without its parent's matches stored |
  | 14 | One team with parent matches enough for the group |
  | 15 | Nothing carried, against the unit tests |
  | 16 | Nothing carried, against Postgres |
  | 17 | Carried over a starting point the snapshot reports |
  | 18 | Carried by team alone, across groups, against Postgres |
  | 19 | The stored rows read for the whole season, against Postgres |
  | 20 | Carried though not asked, against the unit tests |
  | 21 | Carried though not asked, against Postgres |
  | 22 | Stored rows read when no group is unplayed |
  | 23 | Decided from the raw rows, not the ones written |
  | 24 | The page's refresh not asking to carry |
  | 25 | The backfill not asking to carry |

- **Two first survived and were closed.** A condition that repeated what the
  narrower read already ensures was removed, and two Postgres tests were
  sharpened so that 18 and 19 fail: two groups coming back unplayed with the
  same team, and a group with figures whose deduction has been lifted.
- **Against Postgres**: an unplayed group is written with each team's stored
  starting points while another group moves on and a team TASO dropped goes;
  the points are carried again on the next unplayed snapshot and replaced by
  one with figures; a group with figures is taken as it comes; two unplayed
  groups keep their starting points apart; and a sync not asked to carry
  replaces them.
- **The backfill's call is read from its source**, as its other choices are:
  the script is run, not imported.

## After the review

Sourcery's four reviews of this design found three things, three more, three, then one. No further review was asked for after the last fix, on Miikka's word: "either comment to resolve, or fix but no review anymore".

| Finding | Outcome |
|---|---|
| A seeded group with a starting point on one team and none on another was shown as ours, the second team calculated without its seed | Fixed: every team of a seeded group must have one. Mutation 11 |
| Starting points lost before this change cannot be restored | Not changed: there is no source to restore them from. It is listed under what is not solved |
| Two syncs at once, with different teams or groups in their snapshots, can leave rows of both | Not changed: the delete and the upsert are as they were (decisions/196), and so is that outcome |
| Two declaration comments ran to four lines | Shortened to three |
| A configured unseeded group was trusted without checking that its parent's matches are stored | Fixed: every team must have matches in the parent group. Mutations 13 and 14 |

## How it got here

The first attempts kept a group's whole stored rows when a snapshot brought it
back unplayed, and grew a lock, a timeout and a marking of kept rows to
protect them. Sourcery reviewed that six times and found about 36 things; a
second session's read-only review then showed that kept rows go stale, and
that the newest fix was wrong. The lesson is in the design above: only the
starting points needed keeping.

## Measured

On 2026-10-12, read fresh from TASO into an empty database:

| Season | Its continuation groups, as TASO served them |
|---|---|
| Kakkonen 2025 | All 27 rows at `points` 0 and `matches_played` 0 |
| Kakkonen 2024 | Complete, with starting points of 7 to 47 |
| Veikkausliiga 2019 and 2022 | Complete, with starting points |
| Kakkonen 2026, from a laptop in Finland | Complete |
| Kakkonen 2026, in two release runs on GitHub | The six tables at zero in every column |

- The unplayed state is not a rule of age: 2025 has it and 2024 does not.
- Production holds 67 groups with a nonzero `starting_points` row. Most are
  split groups carrying totals of 1 to 55 points; six are groups with a
  deduction of 2 or 3 points; seventeen are youth championship groups with a
  qualifying bonus of up to 3.
