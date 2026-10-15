# 069 — Kausi lyhyesti: the clean-sheet fact

> **Status: draft, not confirmed.** Written for #663. Builds on specs/066
> (`Kausi lyhyesti`, #356, PR #662), which must merge first. Every choice still
> open is in Open Questions, Q1–Q6; the behaviour written beside a question is
> its recommended answer, not a decision.

## Summary

`Kausi lyhyesti` states up to three facts about a club's latest league season.
This adds a fifth kind beside specs/066's four: the season's clean-sheet share
when it is the best or the worst against the club's earlier seasons in the same
competition, the figure `Nollapelit` already shows.

## Scope

### In scope

- A clean-sheet fact in `Kausi lyhyesti`, best and worst (Q2), under every rule
  of specs/066: same competition (S8), at least three earlier seasons (S5), the
  latest season played (S9), five played matches (S6), three sentences at most.
- Its place in specs/066's ranking (R5, Q5).

### Out of scope

- The position fact: #664.
- Any change to specs/066's four facts, its ranking among them, or its strings.
- A clean-sheet run ("five clean sheets in a row"): a streak, not this figure.

## UX / UI (Finnish strings)

In the existing `Kausi lyhyesti` group (specs/066 S2); no new group or heading.

| Fact | Sentence (draft, Q4) |
|---|---|
| Best, against N seasons | `Paras nollapeliosuus 5 kauteen: 42 % otteluista.` |
| Worst | `Heikoin nollapeliosuus 5 kauteen: 8 % otteluista.` |
| Beats every compared season | `Paras nollapeliosuus tallennetuilla kausilla: 42 % otteluista.` (and `Heikoin` likewise) |

- The count `N` is the selected season and the earlier ones it beats in a row,
  newest first, as specs/066 R3.
- The percentage is whole, with a no-break space (`percentText`), as `Nollapelit`
  prints it.

## API & Data

**No new table, no query, no provider request.**

| Needed | Where |
|---|---|
| Each season's share | `cleanSheetSeries(finished, teamId)` (specs/034) over the matches specs/066 already reads for each season; the share after the season's last match played |
| The comparison | specs/066's rules, at the precision `Nollapelit` prints (whole percent, Q1) |
| Ranking | specs/066 R5, with this fact's place among the others (Q5) |

**Caching:** nothing new; the season reads are specs/066's, shared through
React's `cache()`.

## Edge Cases

| Case | Behaviour |
|---|---|
| Fewer than three earlier seasons in the competition | No fact (specs/066 S5) |
| A season with fewer than five played matches | No block at all (specs/066 S6); this fact adds no minimum of its own (Q3) |
| Equal to an earlier season at a whole percent | The count stops there (specs/066 R1, Q1) |
| An earlier season with no finished match for the club | Left out, as specs/066 leaves out a season with nothing stored |
| A season with no clean sheet at all, 0 % | A share like any other: it can be the worst (Q6) |
| Four or more facts qualify | specs/066's cap of three, by R5 |

## Performance & Limits

The share is computed in memory over seasons specs/066 already holds for the
home and away facts; no extra read.

## Security & Secrets

No new environment variable or secret.

## Logging

None new. The feature only reads, and its failures are specs/066's: the block's
one `error` line, `Unable to summarise the season`.

## Acceptance Criteria

- [ ] A clean-sheet share better than the four seasons before it says `Paras nollapeliosuus 5 kauteen`, a worse one `Heikoin`, and one beating every compared season `tallennetuilla kausilla`
- [ ] The sentence's percentage equals the last figure `Nollapelit` shows for the season
- [ ] A share equal at a whole percent to the next earlier season stops the count
- [ ] specs/066's rules hold for this fact: same competition, three earlier seasons, the latest season played, three sentences at most, its place in the ranking as Q5 settles it
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/season-summary.test.ts` | The detector at its boundaries: two and three earlier seasons; equal at a whole percent; best and worst; every season beaten; the ranking with the other facts |
| `tests/unit/components/season-summary-section.test.tsx` | Both sentences and `tallennetuilla kausilla` as exact strings |
| `tests/e2e/season-summary.spec.ts` | On the seeded club, the sentence's percentage equals `Nollapelit`'s last figure |

Every new test is mutation-checked before review.

## Files To Update

- `specs/069-season-summary-clean-sheets.md` (this file)
- `src/lib/season-summary.ts`, `src/components/season-summary-section.tsx`
- `decisions/069-season-summary-clean-sheets.md`, by the implementing agent

## Open Questions

| # | Question | Recommended |
|---|---|---|
| Q1 | Which figure: the share of matches with a clean sheet, or the count of them | **The share**, at the whole percent `Nollapelit` prints. A count favours a season with more matches, and a season in progress could never be the best |
| Q2 | Both directions, or the best only | **Both**, as specs/066 S3: favourable first |
| Q3 | A minimum of its own, beyond specs/066's five played matches | **None**: five is what the block already needs, and the home and away facts take five per side (R2) for the same reason. The cost: two clean sheets in a season's first five matches can read `Paras … 40 %` against full earlier seasons. A higher minimum, ten say, is the alternative |
| Q4 | The sentence's wording | `Paras nollapeliosuus N kauteen: 42 % otteluista.` / `Heikoin …`. Alternatives: `Eniten nollapelejä …` (reads as a count) or `Nollapelejä 42 % otteluista, paras 5 kauteen.` |
| Q5 | Where it ranks in R5 among facts beating as many seasons | **After away, before the upset**: run, home, away, clean sheets, upset |
| Q6 | Is 0 % a fact worth stating as the worst | **Yes**, as any other share: a season without a clean sheet is notable |
