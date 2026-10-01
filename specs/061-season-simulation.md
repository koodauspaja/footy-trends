# 061 — Season simulation: who is likely to win, go up, or go down

> **Status: all questions (Q1–Q12) answered in chat on 2026-10-01. Strings may
> be fine-tuned during implementation.** Written for #347, release 4 in the
> predictions plan — the heaviest of its pieces. It plays out the rest of a
> season many times with Elo's predictions (specs/053) and counts where each
> team finishes.

## Summary

Halfway through a season the table says who is ahead, but not how likely
that lead is to last: a three-point lead with the hardest fixtures still to
come is not the same as one with the easiest. This plays out every remaining
fixture thousands of times — each result drawn from Elo's three-way
probabilities — and adds the results to the current table, so a reader sees
each team's chance of winning the league, finishing near the top or the
bottom, and its expected points.

## Scope

### In scope

- A simulation of a league's remaining stored fixtures in the season in
  progress, from the current table (S1–S5).
- Each team's chances and expected points, on the competition's standings
  page (S7–S9).

### Out of scope

- The Champions League and the cups — #517 (S6).
- A finished season: nothing left to simulate.
- Competition-specific zones (European places, relegation spots) — #518 (S8).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Model | **`elo-v1`'s three-way probabilities per remaining fixture, the competition's draw share** | Miikka, 2026-10-01 (Q1). |
| S2 | Runs | **10 000, a seeded generator** | Miikka, 2026-10-01 (Q2). The same data gives the same figures. |
| S3 | Ratings during a run | **Fixed** | Miikka, 2026-10-01 (Q3). |
| S4 | Ties | **Points, then the current table's order, then random; the decision record says it understates goal-difference swings** | Miikka, 2026-10-01 (Q4). |
| S5 | Split leagues | **Before the split: to the end of the regular season, with each team's chance of the upper group; after it: within each group's stored fixtures, points carried over** | Miikka, 2026-10-01 (Q5). |
| S6 | Which competitions | **The leagues of specs/051 S5's set, both providers; not the Champions League, not the cups** | Miikka, 2026-10-01 (Q6): "keep this to leagues". Knockouts are #517, filed the same day. |
| S7 | Where | **The standings page, specs/057's `Tämä kausi`, a panel `Kauden ennuste`, the season in progress only** | Miikka, 2026-10-01 (Q7). |
| S8 | What it shows | **Per team in table order: `Odotetut pisteet`, `Mestaruus`, `Kolmen parhaan joukossa`, `Kolmen huonoimman joukossa`; before a split `Ylempään ryhmään` in place of the last two** | Miikka, 2026-10-01 (Q8). Real zones are #518, filed the same day. |
| S9 | Rounding | **Whole percentages, `< 1 %` below one, `0 %` only when impossible; points to one decimal** | Miikka, 2026-10-01 (Q9). |
| S10 | Computing | **Per competition-season, Redis 15 minutes; measured before review, a stored result the fallback** | Miikka, 2026-10-01 (Q10). |
| S11 | Access | **Signed in only** | Miikka, 2026-10-01 (Q11). |
| S12 | Three rules | **A fixture postponed without a date is still simulated; Kakkonen's pools are each their own table; a run too slow for a page view is computed and stored by the hourly predictions run (specs/052)** | Miikka, 2026-10-01 (S12): "let's have those in the spec". |

## UX / UI (Finnish strings)

On a covered league's standings page, signed in, for the season in progress,
in specs/057's group `Tämä kausi` (S7):

`Kauden ennuste` — panel heading
- A table, a row per team in the current table's order (S8):
  `Joukkue` · `Odotetut pisteet` · `Mestaruus` · `Kolmen parhaan joukossa` ·
  `Kolmen huonoimman joukossa`; before a split, `Ylempään ryhmään` in place
  of the last two
- Percentages whole, `< 1 %`, `0 %` only when impossible; points `52,4` (S9)
- Under it: `Jäljellä olevat ottelut on pelattu 10 000 kertaa Elo-ennusteiden mukaan. Tasapisteissä ratkaisee nykyinen järjestys.`
- Before a split: `Ennuste ulottuu runkosarjan loppuun; jatkosarjojen ottelut eivät ole vielä tiedossa.`

| String | When |
|---|---|
| `Kauden ennustetta ei voitu laskea. Yritä myöhemmin uudelleen.` | The simulation or a read failed |
| `Kaudella ei ole enää pelaamattomia otteluita.` | No remaining fixture in the season in progress |

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| The current table | As the standings page computes it, including a split's carried points (S5) |
| Remaining fixtures | The season's stored `SCHEDULED`/`TIMED` matches; before a split, the regular season's only (S5) |
| Each fixture's probabilities | `elo-v1` from the current ratings (S1, S3), the competition's draw share |
| A run | Each fixture drawn from its three probabilities with a seeded generator (S2); points added; ranked by points, then current order, then random (S4) |
| Figures | Over 10 000 runs: mean points; share of runs finishing first, in the top three, in the bottom three, or in the upper group (S8) |
| "Impossible" | A team whose maximum possible points cannot reach the needed place: `0 %` only then (S9) |
| Cache | Per competition-season, 15 minutes (S10) |
| Access | `canSeeAnalytics()` first (S11) |

## Edge Cases

| Case | Behaviour |
|---|---|
| A finished season | No panel (Scope) |
| The season in progress with no fixture left | The no-fixtures line |
| A fixture postponed without a date | Still simulated: it is to be played (S12) |
| A placeholder side in a fixture | Not simulated; the decision record names it — it cannot occur in a league |
| A split league before the split | To the end of the regular season; `Ylempään ryhmään` (S5) |
| A split league after the split | Within each group's stored fixtures (S5) |
| Kakkonen's pools | Each pool simulated as its own table (S12) |
| A team mathematically out of a place | `0 %` there (S9) |
| A team certain of a place | `100 %` |
| Signed out | No figure in the HTML (S11) |

## Performance & Limits

10 000 runs × up to ~200 remaining fixtures: about two million draws per
competition-season, in memory. Measured before review (S10); if a page view
cannot afford it, the result is computed by the hourly run and stored instead
(S12).

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] Signed in, a covered league's standings page in the season in progress shows `Kauden ennuste` in `Tämä kausi`: per team its expected points and chance of first, top three and bottom three
- [ ] Each remaining fixture is drawn from `elo-v1`'s probabilities with fixed ratings, 10 000 times, seeded; ties go to the current order, then random
- [ ] Before a split the simulation ends at the regular season and shows the chance of the upper group; after it, each group is simulated with points carried over
- [ ] `0 %` and `100 %` appear only when decided; `< 1 %` below one
- [ ] The Champions League, the cups and finished seasons have no panel
- [ ] A failed run shows the Finnish failure line; signed out, no figure is in the HTML
- [ ] No provider request; cached 15 minutes; its cost measured and written down
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/season-simulation.test.ts` | A run by hand with a fixed seed; points and ranking; ties; the split before and after; decided places; a fixed seed's repeatability |
| `tests/unit/lib/…service….test.ts` | The current table and fixtures read; the cache; failure |
| `tests/unit/components/…` | The panel in `Tämä kausi`, its columns and rounding, the split variant, every Finnish line |
| `tests/e2e/…` | Signed in, a league in progress shows the panel; signed out, none |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/061-season-simulation.md` (this file)
- A pure simulation module, its service, the competition standings page
- `decisions/061-season-simulation.md`, by the implementing agent

## Open Questions

**None.** Q1–Q12 were answered in chat on 2026-10-01 and are recorded as
S1–S12. #517 (knockout simulation) and #518 (competition zones) were filed
from S6 and S8.
