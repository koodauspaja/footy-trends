# 065 — Zones for the foreign leagues: Europe, promotion and relegation

> **Status: Q1–Q6 answered in chat on 2026-10-14 and recorded as S1–S6; the
> rules (Measured), the colours (S4), the labels and S7 settled the same day,
> and the spec confirmed. Strings may be fine-tuned during implementation.** Written for #634, split out of specs/063 (#518) on
> 2026-10-12 (S2). It is the foreign half of specs/063, with rules written by
> hand because football-data publishes none.

## Summary

A table says who is third; it does not say what third is worth. specs/063
marks that on the Finnish standings from Palloliitto's own rules. The nine
foreign leagues have none published, so this registers each league's zones
per season by hand — European places, promotion and its play-off, relegation
and its play-off — and shows them on `/ulkomaat/sarjataulukko`. The season
simulation's columns for those leagues then use them (specs/064).

## Scope

### In scope

- A hand-kept registry of zones per competition and season, for the nine
  leagues (`PL`, `ELC`, `FL1`, `BL1`, `SA`, `DED`, `PPL`, `PD`, `BSA`), every
  stored season (S1, S2).
- Marking them on `/ulkomaat/sarjataulukko` (S3–S5).
- The foreign leagues' columns in `Kauden ennuste`, from the same registry
  (S6).

### Out of scope

- The Finnish leagues: specs/063.
- The Champions League and the cups: no league table.
- Reading rules from a provider: football-data publishes none.
- Changing a European place after the fact, for a cup winner or a coefficient
  (S3).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Where the rules live | **A hand-kept registry beside `competitions.ts`, per competition and season, in the level shape of specs/063 (`level`, `teamCount`, `label`) plus a kind (S4), so `groupZones` and specs/064 read it unchanged. The labels are written by us, in Finnish** | Miikka, 2026-10-14 (Q1): "Hand-kept registry beside competitions.ts (Recommended)". |
| S2 | Which seasons | **Every stored season, from 2023 (football-data's plan stops there), keyed per season. A season with no entry shows nothing, as specs/063 S5** | Miikka, 2026-10-14 (Q2): "Every stored season (2023 on) (Recommended)". Ligue 1's change from 20 to 18 teams predates 2023's data; the key per season is for the next change. |
| S3 | European places | **The league's nominal places, with one line under the table: `Eurooppa-paikat voivat muuttua cup-tuloksilla`** | Miikka, 2026-10-14 (Q3): "Nominal places + one caveat line (Recommended)". They can move with cup results and a coefficient, during and after a season; the line says so. specs/063 S3 left Europe out because TASO publishes none. |
| S4 | Colour | **By kind, never alone: the label in words stays, and a heavier rule is drawn between levels as in specs/063. Kinds: `Euroopan cup`, `nousu`, `karsinta`, `putoaminen`, each a row tint plus a 4 px edge, from the tokens below** | Miikka, 2026-10-14 (Q4): "Colour by kind, label always in words (Recommended)"; the palette: "pick something good that works with the dark color especially and if we had a light theme, something for that too". The registry names its kinds, unlike TASO's free text (specs/063 S6). The qualifying rounds of a European or South American competition (`Mestarien liigan karsinta`, `Eurooppa-liigan karsinta`, `Konferenssiliigan karsinta`, `Copa Libertadoresin karsinta`) are `Euroopan cup`; the play-offs the league itself plays (`Nousukarsinta`, `Putoamiskarsinta`, the Eredivisie's `Karsinta Europeleihin`) are `karsinta` (decisions/065). |
| S5 | Upkeep | **A checklist step in `skills/release.md` or `docs/`, naming the source to check each summer; no test that fails when a season has no entry. A unit test checks that no entry's counts exceed the league's table size** | Miikka, 2026-10-14 (Q5): "Checklist step, no failing test (Recommended)". A test red in August would block unrelated work. |
| S6 | Who sees it, and the simulation | **Everyone, signed in or out. After specs/064, `Kauden ennuste` for these leagues uses the registry's levels as columns** | Miikka, 2026-10-14 (Q6): "Everyone; 635 first, 634 adds foreign simulation columns (Recommended)". Zones are not analytics (specs/063 S13). |
| S7 | How the rules are read | **One rule: the registry holds the places Wikipedia's table for the league and season marks by position (Measured), left out where the page tags a place to a cup winner, a title holder or an administrative decision. A position left out inside one stretch takes that stretch's level (Brazil 2023's 11th, 2025's 13th; Primeira Liga 2024's 18th). No further interpretation and no check against UEFA's or CONMEBOL's lists** | Miikka, 2026-10-14: "let's don't create too complex rules, since this is not the most valuable feature of the whole set". A cup shuffle may leave a place a position did not earn; the caveat line (S3) says places can change. |

## Colours

New tokens in `globals.css`, a value in both schemes (the file's own rule), a
role never a shade. Blue, green, amber and rose are told apart by the word and
the heavier rule as well, so a reader who cannot tell red from green loses
nothing. Measured on 2026-10-14 against the page's `--background` and
`--foreground`/`--muted`; `tests/e2e/dark-mode.spec.ts` re-measures them in a
browser:

| Kind | Dark tint / edge | Light tint / edge | Text on tint (dark, light) | Edge on page (dark, light) |
|---|---|---|---|---|
| `Euroopan cup` | `#0c2a4a` / `#38bdf8` | `#e0f2fe` / `#0369a1` | 12,4 : 1, 15,6 : 1 | 9,2 : 1, 5,9 : 1 |
| `nousu` | `#0b2e1f` / `#34d399` | `#dcfce7` / `#15803d` | 12,6 : 1, 16,3 : 1 | 10,3 : 1, 5,0 : 1 |
| `karsinta` | `#33260a` / `#fbbf24` | `#fef3c7` / `#a16207` | 12,6 : 1, 16,1 : 1 | 11,9 : 1, 4,9 : 1 |
| `putoaminen` | `#3b1219` / `#fb7185` | `#ffe4e6` / `#be123c` | 13,9 : 1, 14,9 : 1 | 7,4 : 1, 6,3 : 1 |

Secondary text (`--muted`) on a tint reads 5,7 to 7,0 : 1. The tints are
deliberately quiet (1,1 to 1,4 : 1 against the page); the edge, which is at
least 4,9 : 1 against the page, carries the colour.

## UX / UI (Finnish strings)

On `/ulkomaat/sarjataulukko` for the nine leagues, in every season with an
entry, signed in or out:

| Element | Content |
|---|---|
| In the table | A heavier rule between two adjacent rows of different levels, as specs/063, and the row tinted by its kind |
| Under the table | One line per level, in table order, as specs/063: `Sija 1: …`, `Sijat 5–6: …`, then our label |
| Under the list, when a level is a `Euroopan cup` | `Eurooppa-paikat voivat muuttua cup-tuloksilla` |
| A season with no entry | No rule, no tint, no list |

Labels, confirmed by Miikka on 2026-10-14 (the first seven): `Mestarien liiga`,
`Eurooppa-liiga`, `Konferenssiliiga`, `Nousee`, `Nousukarsinta`,
`Putoamiskarsinta`, `Putoaa`. The rules found (Measured) need more, proposed
and not yet confirmed (Open Questions): `Mestarien liigan karsinta`,
`Eurooppa-liigan karsinta`, `Konferenssiliigan karsinta`,
`Karsinta Europeleihin` (the Eredivisie's play-offs, Miikka's wording), `Copa Libertadores`,
`Copa Libertadoresin karsinta`, `Copa Sudamericana`. A tint is never the only
signal (S4), and each is legible in light and dark and at 375 px.

## Measured

Looked up on 2026-10-14 from the English Wikipedia's own league tables for
each league and season, read as wikitext (the per-position result codes and
legends), 36 league-seasons. **Not yet checked against UEFA's or CONMEBOL's
own lists**, and not the final registry: it is the draft the implementation
starts from. Seasons are football-data's ids (2023 is 2023–24; the Brazilian
2026 is the calendar year). 2026 is the season in progress, so those rows are
the nominal places. A place the page tags as a cup winner's or a title
holder's (`ELLScup`, `ELTH`, `ECLTH`, `LIB-CB`, `LIB-CL`) is left out, because
no position earns it. Positions are as the page marks them for a finished
season, which already carries the cup shuffles that did happen.

| League | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| `PL` (20) | CL 1–4, EL 5, ECL 6, rel 18–20 | CL 1–5, EL 6–7, rel 18–20 | CL 1–5, EL 6–7, ECL 8, rel 18–20 | CL 1–4, EL 5, rel 18–20 |
| `ELC` (24) | up 1–2, po 3–6, rel 22–24 | same | same | up 1–2, po 3–8 (3–4 semi-finals, 5–8 quarter-finals), rel 22–24 |
| `FL1` (18) | CL 1–3, CL-q 4, EL 5–6, ECL 7, rel-po 16, rel 17–18 | same | same | CL 1–3, CL-q 4, EL 5, ECL 6, rel-po 16, rel 17–18 |
| `BL1` (18) | CL 1–5, EL 6–7, ECL 8, rel-po 16, rel 17–18 | CL 1–4, EL 5, ECL 6, rel-po 16, rel 17–18 | CL 1–4, EL 5–6, ECL 7, rel-po 16, rel 17–18 | CL 1–4, EL 5, ECL 6, rel-po 16, rel 17–18 |
| `SA` (20) | CL 1–5, EL 6–7, ECL 8, rel 18–20 | CL 1–4, EL 5, ECL 6, rel 18–20 | CL 1–4, EL 5–6, ECL 7, rel 18–20 | CL 1–4, EL 5, ECL 6, rel 18–20 |
| `DED` (18) | CL 1–2, CL-q 3, EL 4, EL-q 5, EU-po 6–9, rel-po 16, rel 17–18 | CL 1–2, CL-q 3, EL-q 4, EU-po 5–6 and 8–9, EL 7, rel-po 16, rel 17–18 | same | CL 1, CL-q 2, EL-q 3, EU-po 4–7, rel-po 16, rel 17–18 |
| `PPL` (18) | CL 1–2, EL 3, EL-q 4, ECL-q 5, rel-po 16, rel 17–18 | CL 1, CL-q 2, EL 3, EL-q 4, ECL-q 5, rel-po 16, rel 17–18 | CL 1–2, EL-q 3, ECL-q 4, rel-po 16, rel 17–18 | CL 1–2, CL-q 3, EL-q 4, ECL-q 5, rel-po 16, rel 17–18 |
| `PD` (20) | CL 1–4, EL 5–6, ECL 7, rel 18–20 | CL 1–5, EL 6–7, ECL 8, rel 18–20 | CL 1–5, EL 6, ECL 7, rel 18–20 | CL 1–4, EL 5, ECL 6, rel 18–20 |
| `BSA` (20) | Lib 1–4, Lib-q 5–6, Sud 8–14, rel 17–20 | Lib 1–6, Lib-q 7–8, Sud 9–14, rel 17–20 | Lib 1–5, Lib-q 6–7, Sud 8–14, rel 17–20 | Lib 1–4, Lib-q 5, Sud 6–11, rel 17–20 |

CL is the Champions League league phase, `-q` a qualifying round, EL and ECL
the Europa and Conference League, po a play-off, rel relegation, Lib and Sud
the Copa Libertadores and Sudamericana.

Read by S7: the table is the registry's content as it stands, and the
cup-shuffle seasons (the Premier League's Europa League at 6th and 7th, the
Eredivisie's direct Europa League place at 7th in 2024 and 2025) are taken as
the page marks them. The Brazilian 2023 and 2025 gaps and Primeira Liga
2024's 18th are filled by S7's rule, as the table shows (and `PPL` 2024 reads
rel 17–18).

## API & Data

**No new table and no provider request.** A registry module beside
`competitions.ts` holds each league's places per season as stretches of
positions (`from`, `to`, a named place with its label and kind), and maps
competition code and season to levels, `{ level, teamCount, label, kind }`, a
stretch no place covers becoming a level with no label. A pure function turns
them into zones on the table's row count through `groupZones`. The standings page reads the
registry for a football-data league and passes the zones to the table, as it
does the stored levels for a Finnish one.

**Caching:** none new; the registry is code, and the standings keep their own.

## Edge Cases

| Case | Behaviour |
|---|---|
| A season with no entry | The table as today (S2) |
| A league that is not one of the nine, or a cup | Nothing |
| Counts that cover fewer rows than the table | The rows past them have no zone; a rule separates them from the last counted row, as specs/063 S16 |
| Counts that cover more rows than the table | Zones are cut at the last row |
| A level with no label | Its positions are counted and no line is shown, as specs/063 |
| A level that is a play-off place | `karsinta`, with its own label; not a promotion or relegation |
| A league whose table size changed between seasons (Ligue 1, 2023) | Each season's entry carries its own counts (S2) |
| The Championship's play-off stage, stored apart from the regular season | The zones are on the regular-season table only |
| An earlier round in the round selector | The same zones on that round's order, as specs/063 S8 |
| A Brazilian league season that spans one calendar year | Keyed by its season id like the others |
| 375 px | The list wraps under the table; the table gains no column |

## Performance & Limits

No request is added; the registry is a constant of about nine leagues times
four seasons, a handful of levels each.

## Security & Secrets

No new environment variable or secret.

## Logging

None: the feature only reads a constant, and a missing season is a normal
state, not a failure. A season with no entry is not logged.

## Acceptance Criteria

- [ ] Each of the nine leagues has an entry for every stored season, or is documented as having none
- [ ] `/ulkomaat/sarjataulukko` for a registered season draws a rule between levels, tints each row by its kind, and lists `Sija …`/`Sijat …` with our label under the table
- [ ] A level of kind `Euroopan cup` adds `Eurooppa-paikat voivat muuttua cup-tuloksilla` once, under the list
- [ ] A season with no entry, and any other competition, render as today
- [ ] No entry's counts exceed its league's table size (unit test)
- [ ] The tint is never the only signal, and is legible in light and dark and at 375 px
- [ ] The same signed in and signed out
- [ ] After specs/064, `Kauden ennuste` for these leagues has a column per registered level
- [ ] The summer upkeep step exists and names its source
- [ ] No provider request
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/zone-registry.test.ts` | Each league's entry for each stored season is the right length; counts within table size; the kind of each level |
| `tests/unit/lib/competition-zones.test.ts` | The registry's levels through `groupZones` with a kind kept |
| `tests/unit/components/data-table.test.tsx`, `standings-table.test.tsx`, `tests/unit/app/foreign/standings/page.test.tsx` | The tint and the rule, the list, the Europe line once, a season with none |
| `tests/e2e/standings.spec.ts`, `tests/e2e/dark-mode.spec.ts` | A foreign league's page shows its zones, signed out and at 375 px; each kind's edge is measured in both schemes |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/065-foreign-league-zones.md` (this file)
- The registry module, the standings table and page, the simulation's level
  read once specs/064 has merged
- `docs/zone-registry-upkeep.md`, linked from `skills/release.md`: the summer step (S5)
- `decisions/065-foreign-league-zones.md`, by the implementing agent

## Open Questions

**None.** Q1–Q6 were answered on 2026-10-14 and are S1–S6; the labels (the
seven of the first round and `Mestarien liigan karsinta`,
`Eurooppa-liigan karsinta`, `Konferenssiliigan karsinta`,
`Karsinta Europeleihin`, `Copa Libertadores`, `Copa Libertadoresin karsinta`,
`Copa Sudamericana`), the caveat lines (`Eurooppa-paikat voivat muuttua
cup-tuloksilla`, and for Brazil `Cup-paikat voivat muuttua cup-tuloksilla`),
the kinds of the qualifying rounds, S7 and the palette were confirmed the same
day.
