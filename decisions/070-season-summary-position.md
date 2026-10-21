# 070 — Season summary's position fact (`Kausi lyhyesti`): decisions

Implementation notes for `specs/070-season-summary-position.md` (#664). The spec
says what is shown; this says how, and where the build had to decide something
the spec did not. It builds on decisions/066 (the block, its rules and its
ranking), decisions/069 (the shared count) and decisions/038 (`Tämä kausi
verrattuna`).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rule lives | `positionFact` in `season-summary.ts`, beside `sideFact` and `cleanSheetFact`, counting through the same `recordAgainst`. `recordAgainst` now takes `isBetter`, a larger figure by default; a place passes `place < other` | A smaller place is better. One count for every comparison fact (decisions/069), told which way is up, rather than places negated to fit a rule written for larger figures |
| Which places | `seasonPlaces(teamId, selected, earlier)`: the selected season's place and each earlier season's, all read by `positionIn` at `comparisonShare(teamId, selected)` | Q1 and the second criterion: the sentence's place is the one `Tämä kausi verrattuna` prints. Both functions were private to `season-comparison.ts` and are now exported, and `compareSeasons` calls `comparisonShare` instead of computing the share inline. Its behaviour is unchanged and its tests pass as they were. A second copy of the share rule in `season-summary.ts` could drift from the panel's |
| The share | The club's last round played over the season's length, the whole season when either is unknown (decisions/038's rule) | A finished season is read at its end (Q1). A season in progress is compared with each earlier season at the same share of that season's own length, so a 38-round season and a 10-round one meet at the same point |
| A season that ranks the club nowhere | Selected: no fact. Earlier: stops the count (Q4) | As settled. This differs from the clean-sheet fact, which leaves such a season out, because the spec decided each separately |
| An earlier season with nothing stored | Left out, as every fact leaves it out (`readSeasons`) | Unchanged from decisions/066 |
| Its place in the ranking | `TIE_ORDER`: position, run, home, away, clean sheets, upset (Q6). Favourable when it is a best | As settled. A run counts as beating every compared season, so a place ties with it only when it beats them all too |
| The sentence | `positionSentence`: `Paras sijoitus 5 kauteen: 3.`, through `recordOver`, the same wording in progress (Q5) | `Kausi 2026 (kesken)` above the block already says the season is not over |
| The end-to-end club | decisions/069's second seeded club, `E2E Nolla`. Its 2023/24 is ranked among the twenty stored Premier League clubs and the seeded ones, its earlier seasons among the four seeded clubs, so its place is its worst. 069's test now expects that sentence after the clean-sheet one, and 070's test reads the place from `Tämä kausi verrattuna` and expects the block to state it | The spec asks for the seeded club. The place depends on the real 2023/24 rows in the e2e database, so the tests read it rather than hard-code it; that it is a worst is Q2's cost, places compared whatever the table's size. decisions/066's club gets an unfavourable place too, which ranks after its three favourable facts and drops, so its tests are unchanged |

## Where this differs from the spec

| The spec | Built | Why |
|---|---|---|
| Tests Required: "On the seeded club" | On the second of the two seeded clubs. The spec now says so | Above, under "The end-to-end club" |

## What the tests prove, and how

- **The detector**, `tests/unit/lib/season-summary.test.ts`: three earlier
  seasons and two; the count stopping at a better place; a worst; an equal place
  stopping the count; a season ranking nobody stopping it; a place in the
  middle; no place of its own. `seasonPlaces`: the selected place equal to what
  `compareSeasons` gives the panel, with a round the club sat out after its last
  match; a season in progress against earlier seasons of ten and twenty rounds,
  each at the same share; a finished season's final place; tables of other sizes
  compared by place (Q2); a season ranking nobody. The orchestrator: the place
  against earlier seasons newest first, and a season in progress whose earlier
  seasons all won the league in the end. The ranking: first among equal counts,
  after a fact beating more seasons.
- **The sentences**, `tests/unit/components/season-summary-section.test.tsx`:
  both directions, `tallennetuilla kausilla` and the count, as exact strings;
  and the sentence in the block among the others.
- **Mutations.** Each was applied alone, the named tests run, and the source
  restored.

  | # | Mutation | Caught by |
  |---|---|---|
  | 1 | A larger place better | `season-summary.test.ts` |
  | 2 | An equal place counting as beaten | `season-summary.test.ts` |
  | 3 | No guard for a season ranking nobody | `season-summary.test.ts` |
  | 4 | An earlier season ranking nobody skipped, not stopping the count | `season-summary.test.ts` |
  | 5 | The earlier seasons read at their end | `season-summary.test.ts` |
  | 6 | The selected season read at its end. It survived the first tests, whose tables ended at the club's last round; the panel test now has a round the club sat out after it | `season-summary.test.ts` |
  | 7, 8 | The earlier places read oldest first; one season's place used for all | `season-summary.test.ts` |
  | 9 | The fact left out of the orchestrator | `season-summary.test.ts` |
  | 10, 11 | The place after the run on equal counts; last | `season-summary.test.ts` |
  | 12, 13 | `sijoitus` reworded; the place without its full stop | `season-summary-section.test.tsx` |
  | 14 | The block printing the place as a home or away sentence | `season-summary-section.test.tsx` |
  | 15 | `comparisonShare` fixed at the whole season | `season-comparison.test.ts` |
  | 16 | The sentence printing a place one below the panel's | `season-summary.spec.ts`, end to end |

  Mutation 6 does not fail the end-to-end test: on the seeded club the place
  after its last round and at the season's end are the same. The unit test above
  is what holds that rule.
- **End to end**, `tests/e2e/season-summary.spec.ts` reads `E2E Nolla`'s
  `Sijoitus: tämä kausi N.` from `Tämä kausi verrattuna` and expects `Heikoin
  sijoitus tallennetuilla kausilla: N.` in the block.
