# 064 — Season simulation: each team's chance of the real zones

> **Status: Q1–Q7 answered in chat on 2026-10-14, recorded as S1–S7, and the
> spec confirmed the same day. Strings may be fine-tuned during
> implementation.** Written for #635, split out of
> specs/063 (#518) on 2026-10-12. It replaces specs/061's top-three and
> bottom-three columns with the zones specs/063 stores, and the upper-group
> inference before a split with the stored levels.

## Summary

`Kauden ennuste` says who might win and who might finish in the top or bottom
three, because no rule said what a position is worth. specs/063 now stores
what each position leads to, as Palloliitto publishes it. This shows each
team's chance of every labelled level instead: the title, a medal, a
play-off, relegation, and before a split the continuation group a team goes
to.

## Scope

### In scope

- The columns of `Kauden ennuste` for a table whose group has labelled
  levels (S1–S3, S5).
- The chance of each continuation group before a split, from the
  regular-season group's levels, replacing specs/061 S20's inference (S4).
- "Impossible" and "decided" for a range of positions (S6).

### Out of scope

- Storing or showing zones on the standings table: specs/063.
- The foreign leagues' zones: #634, specs/065. They keep specs/061's columns
  until it builds (S5).
- Miesten Kakkonen and the junior competitions: no levels are stored, so
  specs/061's columns stay (S5).
- Any change to the model, the number of runs, the seed, the tie rule, the
  cache, access or the `/ennusteet` link: as specs/061 (S7).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Which levels become columns | **Every labelled level, in table order, with no filtering on the text. `Odotetut pisteet` stays; `Mestaruus`, `Sarjan voitto`, `Sarjan viimeinen sija`, `Kolmen parhaan joukossa` and `Kolmen huonoimman joukossa` are replaced** | Miikka, 2026-10-14 (Q1): "Every labelled level (Recommended)". specs/063 S6 and S7 refused to sort labels into good and bad. `Kultaa` is first place. |
| S2 | Headings and 375 px | **A column's heading is TASO's label as written, wrapped, with the positions it covers on a second line (`sijat 3–8`). The table scrolls within itself at 375 px, the team name first** | Miikka, 2026-10-14 (Q2): "Label wrapped + positions, table scrolls (Recommended)". No abbreviation of Palloliitto's text. The scroll is specs/060 S6's. |
| S3 | A label naming two outcomes | **One column, as written; the figure is the chance of finishing in those positions** | Miikka, 2026-10-14 (Q3): "One column, as written (Recommended)". specs/063 S6. |
| S4 | Before a split | **The columns are the regular-season group's own levels (`Mestaruussarjaan`, `Karsintasarjaan`), so the chance of the upper group is the first. The previous season's inference no longer chooses them; it stays only to say a season is before its split (the line `Ennuste ulottuu runkosarjan loppuun…`) and to give a season with no stored level specs/061's plain columns** | Miikka, 2026-10-14 (Q4): "Drop it; use the stored levels (Recommended)". One source of truth for the columns. Reworded on 2026-10-14 when built: the levels' labels are free text and cannot say that a split has not happened yet. Overrides specs/061 S20's columns. |
| S5 | A group with no stored level | **specs/061's columns, decided per group: a zoned group and an unzoned one in the same season each keep their own** | Miikka, 2026-10-14 (Q5): "061's columns, decided per group (Recommended)". |
| S6 | `0 %` and `100 %` | **From each team's best and worst reachable finish, by specs/061's extreme scenarios: `0 %` when the level's positions cannot intersect the team's best-to-worst possible finish; `100 %` when every possible finish lies inside them** | Miikka, 2026-10-14 (Q6): "Best/worst reachable position (Recommended)". specs/061 S9 and S18 said it for first, last and the top and bottom three only. |
| S7 | Everything else | **As specs/061: signed in only, the Poisson model, 10 000 seeded runs, ties to the current order, the 15-minute cache, the link to `/ennusteet`, the failure line and its log line, no provider request** | Miikka, 2026-10-14 (Q7): "Agree (Recommended)". |

## UX / UI (Finnish strings)

On `Kauden ennuste` (specs/061 S7), signed in, in the season in progress:

| Table | Columns |
|---|---|
| A group with labelled levels (S1–S3) | `Joukkue` · `Odotetut pisteet` · one column per labelled level in table order: heading the label as written, and under it `sija 1` or `sijat 3–8` |
| A group with none (S5) | specs/061's columns, as today |
| Before a split, levels stored (S4) | `Joukkue` · `Odotetut pisteet` · one column per labelled level of the regular-season group, the continuation groups first |
| Before a split, no level stored (S4) | `Joukkue` · `Odotetut pisteet` · `Runkosarjan voitto`, as specs/061 S20 |

Percentages and points as specs/061 S9 and S18. A narrow screen scrolls the
table within its own box; no new string beyond `sija` and `sijat`, which are
specs/063's words.

The line under the tables, `Jäljellä olevat ottelut on pelattu 10 000 kertaa
Poisson-mallin ennusteiden mukaan. Tasapisteissä ratkaisee nykyinen
järjestys.`, is unchanged. `Ennuste ulottuu runkosarjan loppuun; jatkosarjojen
ottelut eivät ole vielä tiedossa.` stays for a split season before its split,
whichever columns it shows.

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| A group's levels | specs/063's stored levels, read with the group's rows as the standings page reads them; `groupZones` (`src/lib/competition-zones.ts`) turns them into zones on the group's row count |
| A level's chance | The share of runs in which the team finishes in the zone's positions, `from` to `to` (S1) |
| Best and worst reachable finish | specs/061's extreme scenarios, applied to both ends of the zone's range (S6) |
| Before a split | The regular-season group's levels naming its continuation groups (specs/063 S11) |
| Cache | specs/061 S10: per competition-season, Redis, 15 minutes, and cleared by a forced refresh (specs/029) with the answers it was computed from. The key's version is bumped, `forecast:v3`, because the cached value changes shape; a changed set of levels shows within the 15 minutes |

## Edge Cases

| Case | Behaviour |
|---|---|
| A group with levels but none labelled | specs/061's columns for that group (S5) |
| A level with a count and no label | No column; its positions are still counted, as specs/063's `groupZones` does |
| Counts that cover fewer rows than the group | The rows past them are in no column |
| Counts that cover more rows than the group | The level is cut at the last row |
| A zone covering every row of the group | Shown; its chance is `100 %` for every team |
| Two levels with the same label | Two columns, each with its own positions |
| A level of one position | The heading's second line is `sija 1` |
| A split season before the split, levels stored | S4's columns |
| A split season before the split, no levels stored | specs/061 S20's columns, as for a season with no stored level (S4) |
| A split season after the split | Each group by its own levels (S1) |
| A group continued into others, in the season after the split | As specs/061 S17: not shown |
| A pass-through group | Not simulated, as specs/061 S15 |
| Kakkonen's pools | Each its own table with specs/061's columns (S5) |
| A foreign league | specs/061's columns until specs/065 is built (S5) |
| A finished season | No panel, as specs/061 |
| A season whose levels have not been stored yet | specs/061's columns; a sync stores them with the group's rows |
| Signed out | No figure in the HTML, as specs/061 |
| 375 px | The table scrolls within its box; the team name is the first column |

## Performance & Limits

No new request, no new run. The runs already count where each team finishes;
this reads the same finishes into more ranges, so the cost is the figures
kept per team, at most ten levels. The result stays small (specs/061: under
2 KB for a league; ten columns of figures per team adds a few hundred
bytes).

## Security & Secrets

No new environment variable or secret.

## Logging

None new, as specs/061 S22: the one `error` line for a failed simulation. The
feature only reads; a failed read of the levels is logged by the standings
service.

## Acceptance Criteria

- [ ] A group with labelled levels shows `Joukkue`, `Odotetut pisteet` and one column per labelled level, headed with TASO's label as written and the positions it covers
- [ ] `Mestaruus`, `Sarjan voitto`, `Sarjan viimeinen sija`, `Kolmen parhaan joukossa` and `Kolmen huonoimman joukossa` do not appear in a group that has labelled levels
- [ ] A level's figure is the share of runs ending in its positions; a two-outcome label is one column
- [ ] A league that has not split shows its regular-season group's continuation levels as columns, with no inference from the previous season
- [ ] A group with no stored level, Miesten Kakkonen and the foreign leagues show specs/061's columns, per group
- [ ] `0 %` appears only when the level's positions cannot intersect the team's possible finishes, `100 %` only when every possible finish lies inside them; `< 1 %` and `> 99 %` otherwise
- [ ] The table scrolls within itself at 375 px; the team name stays in view
- [ ] No provider request, the same cache, the same access, the same link to `/ennusteet`
- [ ] Correct in light and dark
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/season-simulation.test.ts` | A level's share by hand with a fixed seed; a range in the middle of the table; best and worst reachable finish for both ends of a range, so `0 %` and `100 %` each need the range's two ends separately |
| `tests/unit/lib/season-simulation-service*.test.ts` | Levels read with the group; an unlabelled level counted and not a column; a group with none keeps specs/061's columns; before a split with and without levels; the cache key `forecast:v3`, and a forced refresh clearing it |
| `tests/unit/components/…` | The columns, the two-line heading, a two-outcome label, the scroll box, the unchanged line under the tables |
| `tests/e2e/…` | Signed in, a seeded league with levels shows its columns; a seeded league without keeps specs/061's |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/064-season-simulation-zones.md` (this file)
- `src/lib/season-simulation.ts`, `src/lib/season-simulation-service.ts`, the
  `Kauden ennuste` panel; `src/lib/competition-zones.ts` if the ranges need a
  helper
- `decisions/064-season-simulation-zones.md`, by the implementing agent

## Open Questions

**None.** Q1–Q7 were answered in chat on 2026-10-14 and the spec confirmed. specs/065 (#634) adds the foreign leagues' columns once its
registry exists, through the same level shape.
