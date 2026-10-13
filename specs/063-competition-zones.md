# 063 — Competition zones per season: what each table position leads to

> **Status: all questions answered in chat on 2026-10-12 and the spec
> confirmed; the strings may be fine-tuned during implementation.** Q1–Q14 are
> recorded as S1–S14. Written for #518, split out of specs/061 (#347) on
> 2026-10-01. Measured against TASO, read-only, on 2026-10-12 (see Measured).
> Two points were settled on 2026-10-13, when the work started: an unreadable
> level string stores nothing for its group (S15), and a rule is drawn at every
> level boundary (S16).

## Summary

A table says who is third; it does not say what third is worth. This marks,
on the standings page of a top Finnish league (S4), what each position leads
to that season:
promotion, a play-off, relegation, a medal, or which continuation group a
regular-season place goes to.

The rules are not written by us. Palloliitto publishes them with every group
of every season, and since 2021 with a Finnish label for each. This stores and
shows them as published (S1).

## Scope

### In scope

- The zones of each group of five competitions (S4), per season, stored as TASO
  publishes them (S1, S10).
- Those competitions' standings pages marking them in each group's table
  and naming them under it (S6–S9).
- The number of teams a regular season sends to each continuation group, kept
  among the same rows for the season simulation to read later (S11).

### Out of scope

- The foreign leagues: football-data publishes no zones, so they need a
  hand-maintained registry: #634 (S2).
- European places: TASO labels `Mestaruussarja` with medals only (S3).
- Any change to the season simulation (specs/061): swapping its
  top-three and bottom-three columns for real zones, and its upper-group column
  before a split, is #635, which reads this (S11).
- Seasons TASO gives no labels for: before 2021 or 2022, by competition (S5).
- Miesten Kakkonen and the junior competitions, in every season (S4).
- Cups, and any group not drawn as a table.
- Interpreting a label: no colour for "good" or "bad", no translation, no
  correction of TASO's spelling (S6).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Where the rules come from | **TASO's own `next_stage_levels` and labels**, not a hand-maintained registry | Miikka, 2026-10-12 (Q1): "yes". They are per group and per season already, and Palloliitto keeps them. |
| S2 | The foreign leagues | **Not here: #634** | Miikka, 2026-10-12 (Q2): "you can file a follow-up feature for those leagues". football-data publishes no zones, so nine leagues need rules written and checked by hand per season. |
| S3 | European places | **Not shown; the top of `Mestaruussarja` as TASO labels it, `Kultaa`, `Hopeaa`, `Pronssia`** | Miikka, 2026-10-12 (Q3): "yes, that might change due to success in cups". |
| S4 | Which competitions | **Veikkausliiga, Ykkösliiga, Ykkönen, Kansallinen Liiga and Kansallinen Ykkönen, in every season.** Miesten Kakkonen and the junior competitions are out in every season | Miikka, 2026-10-12 (Q4): "let's do fnnish only, and basically top three adult tiers at max", then chose the men's three and the women's two. A fixed set of competitions, not a rule per season: Kakkonen was the third tier until 2023 and is left out of those seasons too. |
| S5 | Seasons without labels | **Nothing shown**: before 2021 for Veikkausliiga and Ykkönen, before 2022 for the others | Miikka, 2026-10-12 (Q5). Counts alone would draw lines no one can name. |
| S6 | Colour | **None: a heavier rule between levels, and the label in words** | Miikka, 2026-10-12 (Q6): "yes". 44 free-text labels cannot be sorted into good and bad reliably (`Säilyy / Putoaa`, `Jatkokolmannekselle 5 kotiottelua`). |
| S7 | `Säilyy` levels | **Shown like any other label** | Miikka, 2026-10-12 (Q7). Hiding them is an interpretation of the text, as S6. |
| S8 | An earlier round in the round selector | **The same zones on that round's order** | Miikka, 2026-10-12 (Q8). |
| S9 | Where the labels go | **A list under each group's table**, not a column | Miikka, 2026-10-12 (Q9). The table is already at its width at 375 px. |
| S10 | Storage and past seasons | **A new table written with the group's rows, and a one-off backfill that writes levels only.** A forced refresh rewrites the levels without listing them in its diff | Miikka, 2026-10-12 (Q10): "agree". A normal refetch of a finished season was unsafe while #628 was open. It has merged since, and the levels-only backfill stays: about 50 requests, not a full run of both providers, and no team row rewritten. |
| S11 | The season simulation | **#635** (#627 has merged since); this feature changes nothing in specs/061 | Miikka, 2026-10-12 (Q11): "agree". |
| S12 | Caching and logging | **No new cache; the two lines in Logging** | Miikka, 2026-10-12 (Q12). |
| S13 | Who sees it | **Everyone**, signed in or out | Miikka, 2026-10-12 (Q13): "this is not analytics, so yes". |
| S14 | The strings | **As in UX / UI** | Miikka, 2026-10-12 (Q14). |
| S15 | A level string that cannot be read | **All or nothing: the group stores no level and its table renders as today**, with one `warn` line | Miikka, 2026-10-13. The edge case kept the readable levels before the unreadable one while the acceptance criterion left the table as today; a broken string is not trusted in part. |
| S16 | Where the heavier rule goes | **At every level boundary, labelled or not, and between the last counted row and the first row past the counts** | Miikka, 2026-10-13. `Mestaruussarja` 2026 reads `1,1,1,3`, with rules after rows 1, 2 and 3. |

## Measured

One `getCategory` request per league and season, 2015–2026, on 2026-10-12: 63
requests, of which 3 came back `500` with an empty body twice running
(Veikkausliiga 2025, Ykkönen 2023, Kansallinen Liiga 2026).

Each group carries `next_stage_levels`, ten counts in one comma-separated
string (`"1,1,6,0,1,1,0,0,0,0"`), and `next_stage_level_texts`, an array of ten
labels. Positions are handed out from the top of
the group in level order; a level with a count and no label is a stretch of
the table that leads nowhere. Ykkösliiga 2026 reads `1,1,6,0,1,1`:

| Positions | Label |
|---|---|
| 1 | `Nousee Veikkausliigaan` |
| 2 | `Jatkaa liigakarsintaan` |
| 3–8 | `Säilyy Ykkösliigassa` |
| 9 | `Karsii paikastaan Ykkösliigassa` |
| 10 | `Putoaa Ykköseen` |

| Competition | Counts from | Labels from |
|---|---|---|
| Veikkausliiga | 2015 | 2021 |
| Ykkösliiga | 2024 | 2024 |
| Ykkönen | 2015 | 2021 |
| Miesten Kakkonen | 2015 | 2022 |
| Kansallinen Liiga | 2015 | 2021 (two of three groups), 2022 |
| Kansallinen Ykkönen | 2015 | 2022 |

- **A regular season's levels name its continuation groups**: Veikkausliiga
  2026's `Runkosarja` reads 6 `Mestaruussarjaan`, 6 `Karsintasarjaan`.
- **44 distinct labels**, free text. Most are plain (`Putoaa Kakkoseen`,
  `Kultaa`); some are not a single outcome (`Säilyy / Putoaa`,
  `Ykköseen / Kakkoseen`), some are not an outcome at all
  (`Jatkokolmannekselle 5 kotiottelua`), and spelling varies (`Ykkösliigaan`,
  `YkkösLiigaan`).
- **The counts need not cover the group**: Kakkonen 2024's upper groups count
  3 of 6 teams, and 2026's comparison group 8 of 18.
- **No level is labelled with a European place** in any of the 60 responses.
- **We store none of it.** `taso_group_teams` holds team rows only, and a
  finished season is never refetched.
- Miesten Kakkonen was swept and is out of scope (S4); the junior
  competitions were not swept.

## UX / UI (Finnish strings)

On `/kotimaa/sarjataulukko` for the five competitions of S4, in every group
drawn as a table, signed in or out:

| Element | Content |
|---|---|
| In the table | A heavier rule between two adjacent rows that belong to different levels, labelled or not, and between the last row the counts cover and the first one past them (S16). No colour |
| Under the table, above the next group | One line per labelled level, in table order: `Sija 1: Nousee Veikkausliigaan`, `Sijat 3–8: Säilyy Ykkösliigassa` — `Sija` for one position, `Sijat` with an en dash for several, then TASO's label as written |
| Under the last group's list, once | `Sijoitusten merkitykset ovat Palloliiton tulospalvelusta.` |
| A group with no labelled level | No rule and no list |

A position is the row's place in the table as drawn, also when the round
selector shows an earlier round (S8).

No new failure string: the zones are read with the group's rows, and a season
that cannot be read already shows the page's own error.

## API & Data

**One new table; no new provider request while a page is viewed.**

| Needed | Where |
|---|---|
| The levels | `getCategory`'s groups, already fetched for the standings: `next_stage_levels` and `next_stage_level_texts`, which the client does not read today |
| Stored | A new table, `taso_group_zones`: category, competition id, season, group, the level's own number in TASO's order (1–10, so a level without a count leaves a gap), its count, its label or null. One row per level with a count above zero. Migration `create_taso_group_zones` (S10) |
| Written | For S4's competitions only, with the group's team rows, from the same response, replacing the group's earlier levels |
| Past seasons | A one-off command, `npm run backfill -- --zones`, that reads `getCategory` for every stored season of S4's competitions and writes the levels only, never the team rows; run per environment after the migration has deployed (S10). It is refused beside `--reset` or `--refetch` |
| A zone | A stored level with a label: the positions it covers, counted from the top of the group through every level before it, labelled or not |
| The split's size | The regular-season group's own levels, as stored (S11) |

**Caching:** nothing new (S12). The provider response keeps its 15 minutes
(decisions/200); the stored levels are read with the season's group rows.

## Edge Cases

| Case | Behaviour |
|---|---|
| A level with a count and no label | No zone; its positions are still counted, so the levels after it land where TASO puts them |
| A label that is only whitespace | No label |
| The counts add up to fewer than the group's rows | The rows past them have no zone, and a rule separates them from the last counted row (S16) |
| The counts add up to more than the group's rows | Zones are cut at the last row |
| Miesten Kakkonen, a junior competition, a cup | Nothing stored and nothing shown, in any season (S4) |
| A group with no stored level, or none labelled (every season before 2021) | The table as today |
| A count that is not a whole number, or a string that is not ten counts | No level of that group is stored, its table renders as today, and one `warn` line is logged (S15) |
| A group that publishes no counts at all (the field missing or empty) | Nothing stored, and no log line |
| A label missing from the array, or not text | No label |
| A label that names two outcomes, or none (`Säilyy / Putoaa`, `Jatkokolmannekselle 5 kotiottelua`) | Shown as written |
| A pass-through group | Its levels, on TASO's own order |
| A match-list or knockout group | Nothing |
| An earlier round chosen in the round selector | The same zones, on that round's order (S8) |
| A finished season whose continuation tables TASO has zeroed | Out of this spec: the zones are drawn on whatever table #628 leaves there |
| The backfill meets a `500`, an empty body, or an answer with no groups | That season is reported as failed and nothing is written for it; a re-run asks every season again. Team rows are never touched |
| The backfill reads a season with no level to store | Counted as skipped; levels stored for it earlier are cleared, as a sync would |
| A forced refresh (specs/029) | Rewrites the levels with the rows; its diff and audit do not list them (S10) |
| 375 px | The list wraps under the table; the table gains no column |

## Performance & Limits

No request is added to a page view. The stored levels are at most ten rows a
group, read with the group's team rows. The backfill is one request per stored
competition-season, spaced as the sweep was (one every 3 seconds): about 50
for the five competitions.

## Security & Secrets

No new environment variable or secret.

## Logging

| Event | Level | The line |
|---|---|---|
| A group's levels cannot be read as ten whole counts | `warn` | `Unreadable TASO zone levels`, with the category, the competition id and the group id |
| The backfill finishes | `info` | `Zone backfill finished`, with the number of seasons written and skipped (no level to store) and the seasons that failed, as `VL 2025` |

A failed sync is already logged by the standings service. No personal data.

## Acceptance Criteria

- [ ] A TASO sync stores each group's levels that have a count: order, count and label, replacing the group's earlier ones
- [ ] `/kotimaa/sarjataulukko?kilpailu=M1L&kausi=2026` lists `Sija 1: Nousee Veikkausliigaan`, `Sija 2: Jatkaa liigakarsintaan`, `Sijat 3–8: Säilyy Ykkösliigassa`, `Sija 9: Karsii paikastaan Ykkösliigassa` and `Sija 10: Putoaa Ykköseen` under the table, with a heavier rule after rows 1, 2, 8 and 9
- [ ] Veikkausliiga 2026's `Runkosarja` lists `Sijat 1–6: Mestaruussarjaan` and `Sijat 7–12: Karsintasarjaan`
- [ ] A level with a count and no label draws no line of text and still moves the levels after it: Veikkausliiga 2026's `Karsintasarja` lists only its fifth and sixth rows
- [ ] A group with no labelled level, and every season before 2021, renders as today
- [ ] Miesten Kakkonen and the junior competitions render as today in every season, and no level of theirs is stored
- [ ] The backfill command writes levels for stored seasons, changes no row of `taso_group_teams`, and reports a season it could not read
- [ ] The source line appears once, under the last group that has a list
- [ ] The same signed in and signed out
- [ ] No provider request is added to a page view, and no cache
- [ ] Unreadable levels log one `warn` line and leave the table as today
- [ ] The migration is named `create_taso_group_zones`
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/taso.test.ts` | The levels parsed from a group: counts, labels trimmed, an empty label null, a zero count dropped, unreadable counts |
| `tests/unit/lib/…zones….test.ts` | Positions from levels: an unlabelled level counted and not shown; counts short of and past the rows; `Sija` against `Sijat` |
| `tests/unit/lib/taso-standings-service*.test.ts` | Levels written with the rows and replaced on the next sync; the `warn` line |
| `tests/unit/components/…` | The rules between levels, the list, the source line once; a group with none |
| `tests/integration/…` | The table and the sync against Postgres; the backfill leaving `taso_group_teams` unchanged |
| `tests/unit/db/migrations.test.ts` | Passes with the named migration |
| `tests/e2e/…` | A seeded group's list and rules, signed out |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/063-competition-zones.md` (this file)
- `src/db/schema.ts` and a migration; `src/lib/taso.ts`,
  `src/lib/taso-standings-service.ts`, a pure zones module, the standings
  table and page, the backfill command
- `docs/infrastructure.md` if the backfill is a step of a release
- `decisions/063-competition-zones.md`, by the implementing agent

## Open Questions

**None.** Q1–Q14 were answered in chat on 2026-10-12 and are recorded as
S1–S14, and the spec was confirmed the same day. #634 (zones for the foreign
leagues) was filed from S2 and #635 (the simulation's zone columns) from S11.
