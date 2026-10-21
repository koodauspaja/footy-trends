# 070 — Kausi lyhyesti: the league position fact

> **Status: Q1–Q7 answered by Miikka on 2026-10-15 (Settled decisions), and the
> spec confirmed the same day. Strings may be fine-tuned during
> implementation.** Written for #664. Builds on specs/066 (`Kausi lyhyesti`,
> #356, PR #662) and specs/069 (#663, PR #687).

## Summary

`Kausi lyhyesti` states up to three facts about a club's latest league season.
This adds a kind beside specs/066's four: the club's league position when it is
the best or the worst against its earlier seasons in the same competition, read
the way `Tämä kausi verrattuna` reads a position.

## Scope

### In scope

- A position fact in `Kausi lyhyesti`, best and worst (Q3), under every rule of
  specs/066: same competition (S8), at least three earlier seasons (S5), the
  latest season played (S9), five played matches (S6), three sentences at most.
- Its place in specs/066's ranking (R5, Q6).

### Out of scope

- The clean-sheet fact: #663.
- Any change to specs/066's four facts, their ranking among themselves, or
  their strings.
- Promotion, relegation or a title as such ("Nousu Veikkausliigaan"): those are
  zones (specs/063), not a comparison of places.

## UX / UI (Finnish strings)

In the existing `Kausi lyhyesti` group (specs/066 S2); no new group or heading.

| Fact | Sentence (Q5) |
|---|---|
| Best, against N seasons | `Paras sijoitus 5 kauteen: 3.` |
| Worst | `Heikoin sijoitus 5 kauteen: 11.` |
| Beats every compared season | `Paras sijoitus tallennetuilla kausilla: 3.` (and `Heikoin` likewise) |
| The season in progress (Q5) | the same sentence; `Kausi 2026 (kesken)` above the block already says the season is not over |

- The place is whole and ends in its ordinal full stop, as `Tämä kausi
  verrattuna` prints the season's own place (`3.`).
- The count `N` is the selected season and the earlier ones it beats in a row,
  newest first, as specs/066 R3.

## API & Data

**No new table, no query, no provider request.**

| Needed | Where |
|---|---|
| The selected season's place | Its position after the last round the club has played, as `Tämä kausi verrattuna` reads it (`compareSeasons`, specs/038): the place and the table's size |
| Each earlier season's place | `positionAtShare` (specs/038) at the selected season's share of completion: the final place for a finished season, the place at the same point for one in progress (Q1) |
| The comparison | The place, whatever the table's size (Q2) |
| Ranking | specs/066 R5, with this fact's place among the others (Q6) |

All of it is in the season reads specs/066 already makes (`SeasonRead.points`,
`all`, `teamCount`).

**Caching:** nothing new; the reads are specs/066's, shared through React's
`cache()`.

## Edge Cases

| Case | Behaviour |
|---|---|
| Fewer than three earlier seasons in the competition | No fact (specs/066 S5) |
| The selected season ranks the club nowhere (a pass-through table, a season played only in match-list groups) | No fact |
| An earlier season that ranks nobody | Stops the count, as an earlier season with no figure does in specs/066 (Q4) |
| Equal to an earlier season's place | The count stops there (specs/066 R1) |
| A split season (Veikkausliiga) | The place in the combined table after the split, as specs/030 and specs/038 read it |
| The table's size differs between seasons of the competition | Places compared as they are (Q2) |
| A season in progress | Compared at the same share of each earlier season (Q1) |
| Four or more facts qualify | specs/066's cap of three, by R5 |

## Performance & Limits

Computed in memory over seasons specs/066 already holds; no extra read. The
positions per round are built by the season readers already (specs/038).

## Security & Secrets

No new environment variable or secret.

## Logging

None new. The feature only reads, and its failures are specs/066's: the block's
one `error` line, `Unable to summarise the season`.

## Acceptance Criteria

- [ ] A place better than the four seasons before it says `Paras sijoitus 5 kauteen`, a worse one `Heikoin`, and one beating every compared season `tallennetuilla kausilla`
- [ ] The sentence's place equals the season's own place in `Tämä kausi verrattuna`
- [ ] A season in progress is compared with each earlier season at the same share of its length (Q1)
- [ ] A place equal to the next earlier season's stops the count, and a season ranking nobody gives no fact
- [ ] specs/066's rules hold for this fact: same competition, three earlier seasons, the latest season played, three sentences at most, its place in the ranking as Q6 settles it
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/season-summary.test.ts` | The detector at its boundaries: two and three earlier seasons; equal places; best and worst; a season in progress against finished ones at the same share; an earlier season ranking nobody; tables of different sizes compared by place (Q2); the ranking with the other facts |
| `tests/unit/components/season-summary-section.test.tsx` | Both sentences and `tallennetuilla kausilla` as exact strings |
| `tests/e2e/season-summary.spec.ts` | On the second seeded club, the sentence's place equals `Tämä kausi verrattuna`'s |

Every new test is mutation-checked before review.

## Files To Update

- `specs/070-season-summary-position.md` (this file)
- `src/lib/season-summary.ts`, `src/components/season-summary-section.tsx`
- `decisions/070-season-summary-position.md`, by the implementing agent

## Settled decisions

Answered by Miikka on 2026-10-15: "recommendations good", so each question takes its recommended answer.

| # | Question | Decision |
|---|---|---|
| Q1 | Which earlier position: each season's final place, or its place at the same share of the season | **The same share**, as `Tämä kausi verrattuna` already does (specs/038). For a finished season the two are the same; for a season in progress, a final place would compare 10 rounds with 27 |
| Q2 | When the table's size differs between seasons (Ykkönen has had 10 and 12 teams): compare places, or each place's share of its table | **Places**, since the seasons are one competition (S8) and the sentence prints a place. The alternative, shares, is fairer between sizes, but `3.` of 10 would then lose to `3.` of 12 |
| Q3 | Both directions, or the best only | **Both**, as specs/066 S3: favourable first |
| Q4 | An earlier season that ranks nobody (a pass-through table) | **Stops the count**, as specs/066 stops at a season with no figure: a count past it would claim a comparison it did not make. The alternative is to skip it |
| Q5 | The wording, and whether a season in progress says so in the sentence | `Paras sijoitus 5 kauteen: 3.`, the same in progress: `(kesken)` above the block covers it. Alternative: `Paras sijoitus tässä vaiheessa kautta 5 kauteen: 3.` |
| Q6 | Where it ranks in R5 among facts beating as many seasons | **First among the comparisons**: position, run, home, away, then the others. A place is the figure a reader looks at first |
| Q7 | Is a place the club has held only for a round or two worth stating (fifth round, first place) | **Yes**, under specs/066's five played matches: the comparison is with the same point of the other seasons (Q1), which keeps it fair |

## Open Questions

**None.** Q1–Q7 were answered on 2026-10-15 and are recorded above.
