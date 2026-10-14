# 065 — Zones for the foreign leagues: decisions

Implementation notes for `specs/065-foreign-league-zones.md` (#634). The spec
says what the page shows and what the rules are; this says how, and where the
build had to decide something the spec did not. It builds on decisions/063
(`groupZones`, the rule between levels) and decisions/064 (the season
simulation reads a table's levels as its columns).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The registry | `src/lib/zone-registry.ts`: per competition code, `teams` and `seasons`, each season a list of `[from, to, place]` stretches written as the Measured table gives them | S1. Positions as the page marks them are what a person copies, so they are what is stored; the level shape is derived |
| From stretches to levels | `toLevels`: the stretches in table order, and a stretch no place covers becomes a level with no label and no kind | `groupZones` hands positions out from the top in level order, so a gap (Brazil's 7th, the 15th and 16th) has to hold its positions, or the places after it would move up. S7's gaps are the registry's gaps |
| The kinds | `cup`, `promotion`, `playoff`, `relegation`: the roles of S4's `Euroopan cup`, `nousu`, `karsinta`, `putoaminen`, in English as every identifier is. `cup` is a European or South American place, so Brazil's use it as well | A name by role; the label in words is what the reader sees |
| Which kind a qualifying round is | `cup`: `Mestarien liigan karsinta`, `Eurooppa-liigan karsinta`, `Konferenssiliigan karsinta` and `Copa Libertadoresin karsinta` are places in a European or South American competition's own qualifying. `playoff`: `Nousukarsinta`, `Putoamiskarsinta` and the Eredivisie's `Karsinta Europeleihin`, which is a play-off played in the league's own country | The spec confirmed the labels and said the kinds of the qualifying rounds were confirmed, without writing them down. This is the reading that gives the Europe line (S3) to every level that is a European place and the `karsinta` tint to the ones the league plays out itself. **Not stated in the spec; named in the PR body for Miikka to correct** |
| The table's size | `teams` per league, one number, not per season | Ligue 1's change from 20 to 18 predates the data (S2). The unit test says every entry fits it; a season that changes it is the upkeep step's to edit |
| Zone type | `Zone` and `ZoneLevel` gain an optional `kind`; `groupZones` carries it. TASO's levels have none | The registry's levels go through `groupZones` unchanged, as S1 says, and the simulation's `ForecastTable.zones` carries the kind without a second shape |
| The current row | A row `isCurrentRow` says is the page's keeps its shade and takes no tint: two backgrounds on one row are decided by the stylesheet's order, not the class string's. No table with a current row has zones today | `zone-registry` review, `code-review` on the branch |
| The tint | `DataTable` takes `zoneKindOf(row, index)`: a `bg-zone-<kind>-background` class on the row and a 4 px inset `box-shadow` on its first cell, `var(--zone-<kind>-edge)` | The shadow takes no width, so a zoned row's columns line up with an unzoned row's; a border would add 4 px to the first cell of a `table-fixed` table. A class per kind is written out whole in `ZONE_CLASSES` because Tailwind finds a class by reading it |
| The index, not the position | `StandingsTable` tints by the row's place in the table as drawn, as it draws the rule (decisions/063) | A table's own order is what a round's page shows; the `position` a row carries can repeat |
| Tokens | `--zone-<kind>-background` and `--zone-<kind>-edge`, a value per scheme in `globals.css`, `--color-zone-…` in the theme | The file's rule: a role, never a shade. The values are the spec's palette |
| The page | `renderLeagueStandings` reads `registryLevels(competitionCode, seasonId)` once, takes `groupZones` on the table's row count, and passes `zones` and `ruleAfter` to the table; the list and the caveat follow the table | One read, one function, as the Finnish page does. Only the league branch: a cup renders through `renderCupStandings`, which reads no registry |
| The list's words | `zoneLine`, as the Finnish page: `Sija 8: …`, `Sijat 18–20: …`, then our label | S1, UX / UI |
| The caveat line | `cupCaveat(code, levels)` returns the league's own `cupCaveat` from the registry: `Eurooppa-paikat voivat muuttua cup-tuloksilla`, and for `BSA` `Cup-paikat voivat muuttua cup-tuloksilla`; a tenth league has to name its line. Only when a level is a `cup` and a zone is drawn; once, under the list | S3 and the issue's third criterion |
| Where the source line is not | The Finnish page says whose words its labels are (decisions/063); these are ours, so no source line | The labels are written by us (S1); the caveat is the line that says places can change |
| The simulation | `footballDataSeason` passes `registryLevels(code, seasonId)` as the table's `levels`, where decisions/064 left `[]` | The spec's last criterion, and the row of decisions/064 that says football-data keeps specs/061's columns until the registry builds |
| A season with no entry | `registryLevels` answers `[]`: no zone, no rule, no tint, no list, and the simulation keeps specs/061's columns | S2 |
| Upkeep | `docs/zone-registry-upkeep.md`, linked from `skills/release.md`'s Notes | S5. Not a release step: it happens once a year, and a failing test would block unrelated work |

## After the review

Sourcery's second review of #649 found three things.

| Finding | Outcome |
|---|---|
| A forced refresh by an old instance clears only `forecast:v3` while a new instance has cached `v4`, during a rolling deploy | Not changed: it is the old instance's code, which this change cannot alter, and it lasts the deploy window and at most the fifteen minutes of the entry |
| The exported registry is only shallowly readonly | Fixed: `League`'s `teams` and `seasons` are `readonly` and `seasons` is `Readonly<Record<…>>`, so an importer cannot assign into an entry. A type, so there is no runtime mutation to run; `tsc` fails an assignment |
| The registry test's seasons are a fixed list | Not changed: S5, Miikka, 2026-10-14: no test that fails when a season has no entry, because one red in August would block unrelated work. The upkeep step is what adds the season |

## Cache

`forecast:v4:<provider>:<code>:<season>`. **Overrides the key named in
decisions/064 (`forecast:v3`), which stays as written.** The value's shape is
unchanged, but a football-data league's forecast now has zone columns, and a v3
entry written before the deploy, or by an older instance while the deploy rolls,
has none; under the old key it would be served for up to fifteen minutes.
Sourcery's first review of #649 found it, and the first draft of this record,
which kept v3, was wrong: v3 was safe for the shape and not for the content.
A forced refresh clears the forecast's key (decisions/064) through
`forecastCacheKey`, so `force-refresh.ts` follows the bump without a change.

## A failed read

There is none to tell from "no zones": the registry is a constant read in the
process, so `registryLevels` cannot fail, and a season with no entry is the
normal state of S2, not a failure. The standings and the forecast keep their
own failure paths (decisions/063, decisions/064), and the page draws no zone for
a table that was not read: a test per status.

## Where the spec was made to say what is built

- **The kinds of the qualifying rounds** are written into the table above; the
  spec confirmed them without listing them, and its S4 row now says them.
- **Caching, the UX table and the acceptance criterion** say what is built: the forecast's key is `v4`, and Brazil's caveat line is named beside the European one. specs/064's cache rows and its out-of-scope line say `v4` and that this built the foreign leagues' columns; its other records stay as written.
- **The registry's shape** (API & Data): stretches of positions, from which the
  levels are derived, where the spec said levels.
- **Tests Required and Files To Update** name the files built, and the upkeep
  step's file.
- **The Measured table's reading is the registry's content as written**, with
  the gaps S7 fills as `toLevels` handles them: a stretch no place covers.

## What the tests prove, and how

- `tests/unit/lib/zone-registry.test.ts`: the nine leagues and no other, each
  stored season (2023 to 2026) has an entry whose counts fit its league, a gap
  is a level of its own, the four kinds, the Eredivisie's play-offs, an unknown
  code or season, and the caveat's three answers.
- `tests/unit/lib/competition-zones.test.ts`: `groupZones` keeps a kind.
- `tests/unit/components/data-table.test.tsx` and `standings-table.test.tsx`:
  the tint, the edge on the first cell only, each kind, the index not the
  position, and no change for a table not asked.
- `tests/unit/app/foreign/standings/page.test.tsx`: the tints, the rules, the
  list and its order, the caveat once, Brazil's wording, the Championship's lack
  of one, a shorter table, a season with no entry, an empty and a failed read,
  and the Champions League.
- `tests/unit/lib/season-simulation-service.test.ts`: a football-data league's
  zones are the registry's, cut at the table; a season with none has none.
- `tests/e2e/standings.spec.ts`: signed out, a foreign league's zones, tint,
  rule and caveat, at 375 px with no sideways scroll on the page.
  `tests/e2e/dark-mode.spec.ts`: the zoned pages swept in both schemes, and
  each kind's edge measured against the page.

## Every mutation was caught

Each was applied alone, the tests run, and the file restored from a commit.

| # | Mutation |
|---|---|
| 1 | A gap not held as a level |
| 2 | The kind not carried by `groupZones` |
| 3 | Brazil given the Europe line |
| 4 | Europe given the cup line |
| 5 | The caveat with no level a cup place |
| 6 | The caveat drawn with no zone |
| 7 | The edge on every cell |
| 8 | The tint by the position a row carries |
| 9 | The zones not given to the table |
| 10 | The rules not given to the table |
| 11 | The list not drawn |
| 12 | The active season read for the registry |
| 13 | The simulation reading no levels |
| 14 | A relegation row given the cup tint |
| 15 | A play-off row given no edge |
| 16 | The Championship's table size too small |
| 17 | The Premier League 2025's Conference place dropped |
| 18 | The Eredivisie's play-off taken as a cup place |
| 19 | Promotion taken as a cup place |
| 20 | Brazil 2023's gap at 15 and 16 closed |
| 21 | A row tinted that nothing asked to tint |
| 22 | A code read as a key of the registry that is not its own (`constructor`) |
| 23 | Two stretches swapped in a season's entry (the registry test of order) |
| 24 | The current row given the zone tint as well |
| 25 | Brazil's league given the European line |

The own-key check `cupCaveat` first had survived its mutation (a key the registry does not own reads `undefined` there anyway) and was removed; the `constructor` case stays as a test of the behaviour. The sort `toLevels` first had was removed: the places are written in table
order and no input is not, so no test could tell it from its absence.
