# 069 — Kausi lyhyesti: the clean-sheet fact: decisions

Implementation notes for `specs/069-season-summary-clean-sheets.md` (#663). The
spec says what is shown; this says how, and where the build had to decide
something the spec did not. It builds on decisions/066 (the block, its rules and
its ranking) and decisions/034 (`Nollapelit`).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rule lives | `cleanSheetFact` in `season-summary.ts`, beside `sideFact`. Both now count through one `recordAgainst(value, earlier)`, which is decisions/066's `beatenInARow` taking figures instead of sides, with the loop over best and worst moved into it | R1 and R3 are one rule for both facts: strictly better (or worse) in a row, newest first, best looked for before worst, `everySeason` when every compared season is beaten. Two copies of it could drift apart. `sideFact` returns what it did, and decisions/066's tests for it pass unchanged |
| The figure | `shownCleanSheetShare`: the share after the club's last match in `cleanSheetSeries` (specs/034), `Math.round`ed. The comparison and the sentence both use that whole percent | Q1: the percent `Nollapelit` prints. `percentText` rounds with `Math.round` too, so the sentence cannot print a figure the panel does not. `lib/` imports no component (decisions/066, "Where the sentences live"), so the rounding is written out again, and the tests pin it at 33, 67 and 12,5 → 13 |
| The matches it is read over | Each season's `finished` from the reads the block already makes, the same rows `Nollapelit` and `Koti- ja vierastilastot` are drawn from (`teamPanels`' one read) | No new read (the spec's API & Data). decisions/066's end-to-end test already shows the home figure equals the panel's over these reads |
| An earlier season with no match for the club | Left out of this comparison, as the spec's edge case says, so the next season is compared. A side with no match still stops the home or away count, as decisions/066 decided | The spec settles it this way. For a side, decisions/066 argued a count past a missing figure claims a comparison it did not make. For the share, the season is simply not a compared one, as `readSeasons` leaves out a season with nothing stored |
| No minimum of its own | The block's five played matches only (Q3) | As settled |
| Its place in the ranking | `TIE_ORDER`: run, home, away, clean sheets, upset (Q5). It is favourable when it is a best, like a side (`isFavourable`'s default branch) | As settled. The upset already counts as beating no season, so the clean-sheet fact ranks before it whatever the tie order |
| The sentence | `cleanSheetFactSentence` in `season-summary-section.tsx`, which shares `recordOver` (`Paras kotisaldo 5 kauteen`, `Heikoin … tallennetuilla kausilla`) with `sideSentence` | One place for the record word and the count. The name, because `cleanSheetSentence` already names the `Nollapelit` chart's text row |
| decisions/066's end-to-end club | Its 2023/24 opens with a 2–1 home win rather than 1–0, so it keeps five clean sheets in ten, 50 %, equal to 2022/23's. Its block keeps the three sentences that test asserts | Every win was 1–0, so 2023/24's six clean sheets (60 %) beat every earlier 50 %. That fourth favourable fact ranks above the upset and would push it out of the cap of three, taking the link that test follows with it. The results, and so every other fact, are as they were |
| This feature's end-to-end club | A second club, `E2E Nolla`, seeded into the same four seasons, whose block holds only the clean-sheet fact | The first club's block is full. On the second club every season has the same home and away results, so no side fact holds, and its 2023/24 runs (one win, two defeats) are shorter than the five-match runs of 2020/21 that `Ennätykset` names, so no run fact holds. It has no Elo row, so no upset. One clean sheet in each earlier season (10 %), three in 2023/24 (30 %) |
| The unit tests' fixture | `finished()` in `season-summary.test.ts` now concedes a goal in every `V`, `T` and `H`, and lowercase `v` and `t` keep a clean sheet | The old scores made every win and draw a clean sheet, so decisions/066's fixtures would all have grown a clean-sheet fact and changed their expected blocks. With a goal conceded every share is 0 %, the seasons are equal, and those tests read as before |

## Where this differs from the spec

| The spec | Built | Why |
|---|---|---|
| Tests Required: "On the seeded club, the sentence's percentage equals `Nollapelit`'s last figure" | On a second seeded club. The spec now says so | Above, under "This feature's end-to-end club" |

## What the tests prove, and how

- **The detector**, `tests/unit/lib/season-summary.test.ts`: the rounding
  against `Nollapelit`'s; the club's own side of each match; three earlier
  seasons and two; the count stopping at a better season; a worst at 0 % (Q6);
  an equal season stopping the count; a season with no match left out; a share
  in the middle; and the orchestrator stating the fact from the reads, with a
  season the club played no match in left out. The ranking: after away, before
  the upset, behind home on equal counts, ahead of a side beating fewer seasons.
- **The sentences**, `tests/unit/components/season-summary-section.test.tsx`:
  both directions, `tallennetuilla kausilla`, the count with the selected season,
  and the no-break space before `%`, as exact strings; and the sentence in the
  block among the others.
- **Every mutation was caught.** Each was applied alone, the two test files run,
  and the source restored.

  | # | Mutation | Caught by |
  |---|---|---|
  | 1, 2 | The share not rounded; floored | `season-summary.test.ts` |
  | 3 | The share read for another team | `season-summary.test.ts` |
  | 4 | A season with no match not left out | `season-summary.test.ts` |
  | 5 | No guard for a season with no share | `season-summary.test.ts` |
  | 6, 7 | The tie order putting clean sheets before away; before home | `season-summary.test.ts` |
  | 8 | The fact left out of the orchestrator | `season-summary.test.ts` |
  | 9 | The selected season compared with itself | `season-summary.test.ts` |
  | 10 | The orchestrator reading another team's share | `season-summary.test.ts` |
  | 11 | A best that only equals counting as beating, in `recordAgainst` | `season-summary.test.ts` |
  | 12 | `everySeason` always false, in `recordAgainst` | `season-summary.test.ts` |
  | 13 | `nollapeliosuus` reworded | `season-summary-section.test.tsx` |
  | 14 | The percent printed without `percentText` | `season-summary-section.test.tsx` |
  | 15 | The count without the selected season | `season-summary-section.test.tsx` |
  | 16 | `Paras` and `Heikoin` swapped | `season-summary-section.test.tsx` |
  | 17 | The block printing the fact as a home or away sentence | `season-summary-section.test.tsx` |

- **End to end**, `tests/e2e/season-summary.spec.ts` seeds the second club and
  reads its block's one sentence, `Paras nollapeliosuus tallennetuilla kausilla:
  30 % otteluista.`, and the last row of `Nollapelit`' text alternative, `30 %
  (3/10)`. decisions/066's tests still pass on the first club, which now has a
  share equal to the season before it and so no clean-sheet sentence.
