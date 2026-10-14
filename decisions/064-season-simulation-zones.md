# 064 — Season simulation: each team's chance of the real zones: decisions

Implementation notes for `specs/064-season-simulation-zones.md` (#635). The
spec says what the panel shows; this says how, and where the build had to
decide something the spec did not. It overrides decisions/061's table of
columns where a group has stored levels, and its before-a-split row for the
columns only (see Where the spec was made to say what is built).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where a zone is counted | `simulateTable` takes the table's zones and counts, per run and per place, how often each team finishes inside each zone's `from` to `to`; `ForecastRow.zones` holds one `Chance` per zone, in the zones' order | S1. The runs already rank every team; a zone is one more range to count them in, so the cost is the same simulation. Measured on the largest league (24 teams, 446 fixtures, 10 000 runs, a laptop): 96 ms without zones, 99 ms with five. |
| Which zones a table has | `groupZones(levels, rows.length).zones`, specs/063's own function: labelled levels only, an unlabelled one taking its places, cut at the last row | S1, S3. The standings page draws its list from the same function, so the panel and the page cannot disagree on which positions a label covers. |
| `0 %` and `100 %` | A zone is out of reach when `best > to - 1` or `worst < from - 1`, and certain when `best >= from - 1` and `worst <= to - 1`, with `best` and `worst` the team's finishing places counted from 0 as specs/061 computes them | S6. Top three is the zone of places 1 to 3 and bottom three the last three: the same two inequalities give specs/061's conditions, and a test asserts a zone over the same stretch equals `first` and `bottomThree` run for run. |
| Zones per group | `SeasonTableInput.levels` is the group's own stored levels; a group with none labelled has `zones: []` and the panel keeps specs/061's columns for it | S5. A league's `Mestaruussarja` can have levels while a pool or a pass-through group has none. |
| Where the levels are read | `getSeasonTables` returns each table's `levels`, read once per season after the classification with `storedGroupLevels`, and none for a competition that `publishesZones` rejects | S4. decisions/063 left `getSeasonTables` alone because the simulation, the cups and the team pages share `classifySeasonGroups`; it adds a field and does not change the classification. The levels are read the way the standings page reads them, and a competition that stores none is not asked. |
| football-data | `levels: []` | specs/065 (#634) gives these leagues a registry; until it builds they keep specs/061's columns (S5). |
| The cache | `forecast:v3:<provider>:<code>:<season>` | The cached value changed shape: a v2 entry has no `zones`, and a page rendering it within the 15 minutes after a deploy would read `undefined`. The spec said the key was unchanged; a changed shape is what a key's version is for. |
| Zone columns | One column per zone, 112 px, headed by the label as written with `sija 1` or `sijat 3–8` on a second line; the table scrolls inside its box as before | S2. The label wraps; positions are specs/063's words in lower case. Five zones (Ykkösliiga) need 112 + 72 + 5 × 112 = 744 px. |
| The team's name | `sticky left-0` with the page's background on the name cells, in every forecast table | AC "the team name stays in view". The tables scrolled before without it; a wide table is where it matters, but a name that stays in view is no worse in a narrow one. A unit test asserts the class; jsdom cannot scroll, so the behaviour is not asserted. |
| The panel's other lines | Unchanged | S7. |

## Where the spec was made to say what is built

- **S4 said the inference from the previous season is dropped.** The columns
  of a season before its split now come from the stored levels, so the inference
  no longer chooses them. It still decides two things nothing else can: that a
  season is before its split, for the line `Ennuste ulottuu runkosarjan loppuun`
  (the levels' labels are free text and say nothing about whether a
  continuation group exists yet), and the columns of a season with no stored
  level at all, which specs/061 S20 gave. The spec's table of columns and its
  edge cases already said so; its decision row is reworded to match.
- **The spec said the cache key was unchanged.** It is bumped to v3, above.

## Measured

Largest league, 24 teams, 446 fixtures, 10 000 runs, a laptop, mean of five
after one warm-up: 96 ms with no zone, 99 ms with five. Not measured inside
Railway: the cost is the same simulation.

## Not done

- The foreign leagues' zones: #634, specs/065.
- Zones in the standings table's rows or any other page: specs/063.
