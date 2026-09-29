# 046 — Kääntyneet ottelut only where the half-time score is known: decisions

Implementation notes for `specs/046-comebacks-half-time-coverage.md` (#473).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rule lives | `enoughHalfTimeKnown` in `comebacks-section.tsx`, beside the note | It is a presentation rule over figures the series already carries (`known`, `missing`); nothing is fetched or stored differently, and every page gets it by rendering the same panel (S3). |
| The comparison | Whole numbers: `known × 5 ≥ total × 2` | Exactly 40 % is exact by construction. A first draft of the comment claimed `0.4 × 15` misrounds in floating point; checked, it does not — no total up to 5 000 fails either form — so the claim was removed rather than kept as a justification. The fraction stays because it needs no such argument. |
| A season with no played match | No clause of its own | `0 × 5 ≥ 0 × 2` already holds, so the figures' `Ei vielä otteluita …` lines show (S6). The first version had `total === 0 ||`; a mutation removing it changed nothing, which is how it was found to be redundant. |
| The note's numerals | No case ending on either | S5: the elative ending after a numeral follows how it is read (`8:sta`, `84:stä`), so the agreed first wording would have been wrong for many totals. `N ottelusta` is the same for every N, as `missingText` already relied on. |
| `NO_HALF_TIME_MESSAGE` | Removed | S4: its "tälle kaudelle" was wrong on the national-team pages, and the note covers 0 %. The e2e that fell back to it on a season stored before migration `0017` now expects the note. |

## What the tests prove, and how

- The unit tests cover below 40 % (8 of 84), exactly 40 % (6 of 15, and the
  existing 2 of 5), 38 %, 0 % and no match at all; the note's exact wording and
  that no numeral carries a case ending.
- Mutations: the threshold loosened to 20 %, the boundary made exclusive, the
  note's total miscounted, and the figures never hidden (e2e, both national
  teams) each fail a test. Removing the no-match clause did not — see above.
- e2e: on both national-team pages the panel shows the note and no figures, and
  `tälle kaudelle` appears nowhere.

## Verified

`/maajoukkueet/huuhkajat` on the test database: *Puoliaikatulos on tiedossa vain
4 ottelusta, kun otteluita on 80. Kääntyneitä otteluita ei lasketa.* — at 375 px,
light and dark, with no sideways scroll. The production figures in #473 (about 8
of 84, and 1 of 84) are both below 40 %, so production will show the note too;
that is read off the issue's own numbers, not seen on production.
