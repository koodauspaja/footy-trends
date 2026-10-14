# 062 — Scoreline probability grid for an upcoming match

> **Status: all questions answered in chat on 2026-10-12; the strings may be
> fine-tuned during implementation.** Q1–Q10 are recorded as S1–S10. Written for
> #514, filed from specs/055 S9 on 2026-10-01.

## Summary

`Ennuste` names the Poisson model's single most likely score, `1–1 (12 %)`.
The model already computes the probability of every scoreline to reach it, and
throws the rest away. This shows them: a small grid, home goals by away goals,
so a reader sees how likely 2–0 or 0–0 is, and how much the likeliest score
leads the rest by.

## Scope

### In scope

- A grid of scoreline probabilities for an upcoming match, from the
  `poisson-v1` prediction `Ennuste` already shows (S1–S7).
- Wherever `Ennuste`'s body is drawn: the match page, and the head-to-head
  page's `Seuraava kohtaaminen` (C4, S1).

### Out of scope

- Any change to the model, its fit, its constants or the predictions log:
  `poisson-v1` stays `poisson-v1`.
- A grid for the baseline or Elo, which predict no goals.
- A grid for a finished match, or a comparison of the grid with the result.
- Row or column totals, and probabilities of goal counts ("over 2,5 goals")
  (S8).
- Not an `Analyysit` panel, so it joins none of that page's groups.

## Carried over

Settled in earlier specs, and not reopened here.

| # | Decision | From |
|---|---|---|
| C1 | The model's grid is 0–10 goals a side, the remainder spread back, the draw cells scaled by the competition's factor | specs/055 S6, S7, S16 |
| C2 | The most likely score is the largest cell of that 0–10 grid; a tie goes to the fewer total goals, then the fewer home goals | specs/055 S20 |
| C3 | No Poisson prediction for a placeholder side, or for a competition the fit has no match of | specs/055 S15 |
| C4 | The head-to-head page draws `Ennuste`'s body with the same component, so the two pages cannot disagree | specs/058 S3 |
| C5 | Signed out, no probability is in the HTML | specs/051 S4 |

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Where the grid sits | **Inside `Ennuste`, under the Poisson line**, and so on the head-to-head page too | Miikka, 2026-10-12 (Q1): "as suggested". C4: one body, so the two pages cannot disagree. |
| S2 | How many goals | **`0`–`4` and `5+` each way** | Miikka, 2026-10-12 (Q2). As specs/044. From plain Poisson, the `5+` cells hold 2,9 % together at expected goals 1,6 – 1,1, 7,4 % at 2,2 – 0,8 and 18,5 % at 3,0 – 0,6; `0`–`5` and `6+` would hold 0,7 %, 2,5 % and 8,4 %, at seven columns. |
| S3 | What a cell shows | **A whole percentage; `<1 %` when it rounds to zero** | Miikka, 2026-10-12 (Q3). At 1,6 – 1,1, 6 of the 25 exact cells are under 1 %; at 3,0 – 0,6, 11 are. |
| S4 | Shading | **Four steps by the cell's share of the largest shown cell** | Miikka, 2026-10-12 (Q4). As specs/044. |
| S5 | The most likely score | **Its cell outlined and its figure bold** | Miikka, 2026-10-12 (Q5). At 3,5 – 0,5 the `5+`–`0` cell is about 17 % and the most likely score about 13 %, so shading alone would point away from the score the line names. |
| S6 | Orientation | **Home down, away across**, also on the head-to-head page | Miikka, 2026-10-12 (Q6). `Tulokset` there stays in the URL's order (specs/044 S5); each grid names its own axes. |
| S7 | A phone layout | **None of its own**: six narrow columns | Miikka, 2026-10-12 (Q7). As specs/044. |
| S8 | Totals | **None** | Miikka, 2026-10-12 (Q8). The Poisson row gives the three outcomes; with `5+` the cells no longer split cleanly into them (`5+`–`5+` mixes all three). |
| S9 | Caching and logging | **Nothing new for either** | Miikka, 2026-10-12 (Q9). No read is added; the fit keeps its cache and its own `error` lines (specs/055 S11, S19). |
| S10 | The strings | **As in UX / UI** | Miikka, 2026-10-12 (Q10). |

## UX / UI (Finnish strings)

In `Ennuste`, signed in, directly under the Poisson line and above the failure
lines, `MOVES_NOTE` and the rounding note:

| Element | Content |
|---|---|
| The line above the grid | `Tulosten todennäköisyydet Poisson-mallin mukaan:` |
| The grid | An HTML table, as specs/044's `Tulokset`. Rows are the home side's goals, `0`–`4` and `5+`; columns are the away side's, the same |
| The corner | `HJK ↓ / KuPS →` — home down, away across, the names as the Poisson line writes them |
| A cell | A whole percentage, `12 %`. One that rounds to zero: `<1 %` |
| Shading | Four steps by the cell's share of the largest shown cell, theme tokens only, as specs/044 |
| The most likely score | Its cell outlined and its figure bold: the one the Poisson line names |
| The line under the grid | `5+ tarkoittaa viittä tai useampaa maalia.` |

The existing rounding note, `Osuudet on pyöristetty, joten niiden summa voi
poiketa 100 prosentista.`, already ends `Ennuste` and covers the grid.

No new failure string: when the fit fails there is no Poisson row and no grid,
and `Poisson-mallia ei voitu laskea. Yritä myöhemmin uudelleen.` stands.

## API & Data

**No new table, no provider request, no new read.**

| Needed | Where |
|---|---|
| The 0–10 grid | specs/055's `scoreGrid`, already built for every Poisson prediction and today reduced to its largest cell |
| The shown grid | That grid folded to 6 × 6: every cell with 5 or more goals for a side summed into that side's `5+` (S2). It still sums to 1 |
| The outlined cell | The shown cell holding C2's score |

**Caching:** nothing new (S9). The grid is computed from the Poisson fit, which
keeps its 15 minutes per provider (specs/055 S11).

## Edge Cases

| Case | Behaviour |
|---|---|
| No Poisson row: a placeholder side, a competition with no fitted match, a failed fit | No grid, and no line above or under it (C3) |
| The baseline failed or has no history | `Ennuste` shows its one message, as today; no grid |
| Signed out | No grid and no cell in the HTML (C5) |
| A cell that rounds to 0 % | `<1 %`, unshaded only if it is exactly 0 |
| A `5+` cell larger than the most likely score's | It is the darkest; the outline stays on the most likely score's cell (S5) |
| The most likely score has 5 or more goals for a side | The `5+` cell holding it is outlined (S5) |
| Several cells tied for most likely | One outline, on C2's score |
| The head-to-head page | The grid in `Seuraava kohtaaminen`, home side down. `Tulokset` below it stays in the URL's team order (specs/044 S5), so the two grids can be turned against each other; each names its own axes (S6) |
| 375 px | Six columns of the width specs/044 uses, in a horizontally scrollable wrapper as a safeguard; no separate phone layout (S7) |

## Performance & Limits

No read is added. Folding 121 cells into 36 is done per render, on a grid the
prediction already builds.

## Security & Secrets

No new environment variable or secret.

## Logging

**None (S9).** The feature only reads, from a fit whose failures specs/055
already logs at `error`. Nothing personal is read or logged.

## Acceptance Criteria

- [ ] Signed in, an upcoming match with a Poisson row shows the grid under the Poisson line: home goals down, away goals across, `0`–`4` and `5+` each way
- [ ] The shown cells are the model's 0–10 grid with every score of 5 or more summed into `5+`, and sum to 1 before rounding
- [ ] Each cell is a whole percentage; one that rounds to zero reads `<1 %`
- [ ] The cell of the score the Poisson line names is outlined, also when a `5+` cell is larger
- [ ] No Poisson row means no grid: a placeholder side, a competition the fit has no match of, a failed fit
- [ ] The head-to-head page's `Seuraava kohtaaminen` shows the same grid as the match's own page
- [ ] Signed out, no cell's probability is in the HTML
- [ ] No new read, cache or log line; `poisson-v1` and its logged rows are unchanged
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/poisson.test.ts` | The fold: a 7–0 cell counts in `5+` against `0`, a 6–6 in `5+` against `5+`, the 36 cells sum to 1; `predictPoisson` carries the grid; the three outcomes and the most likely score unchanged |
| `tests/unit/components/match-prediction.test.tsx` | The grid's axes, corner and two lines; `<1 %`; the outline on the named score, with a larger `5+` cell present; no grid with no Poisson row or a failed fit |
| `tests/unit/components/head-to-head-page.test.tsx` | The grid inside `Seuraava kohtaaminen` |
| `tests/e2e/…` | The seeded upcoming match shows the grid signed in, and no cell signed out |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/062-scoreline-probability-grid.md` (this file)
- `src/lib/poisson.ts`, `src/components/match-prediction.tsx`, and specs/044's
  cell shading if it is shared rather than copied
- `decisions/062-scoreline-probability-grid.md`, by the implementing agent

## Open Questions

**None.** Q1–Q10 were answered in chat on 2026-10-12 and are recorded as
S1–S10.
