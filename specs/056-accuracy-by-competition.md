# 056 — Prediction quality by competition: which model works where

> **Status: Q1–Q8 answered in chat on 2026-10-01; the filtered page's strings
> and three edge-case rules (Q9) proposed, awaiting confirmation.** Written for #353, release 3 in the
> predictions plan. It extends specs/054's page, `/ennusteet`, which judges
> the models over a whole provider at once (specs/054 S4, S10 left this
> breakdown to #353).

## Summary

A model can be good in the Premier League and poor in Ykkönen: a home-win
baseline does well where home advantage is strong, Elo where the same teams
meet often, Poisson where goals are plentiful. specs/054 answers "how good is
each model?" over all of a provider's matches; this answers **"which model is
best in this competition?"**

## Scope

### In scope

- A breakdown of specs/054's measures by competition, on `/ennusteet`
  (Q1, Q2).
- Every model the log holds — the baseline, Elo, and Poisson once specs/055
  ships.

### Out of scope

- A new measure: specs/054's accuracy, Brier score, log-loss and calibration
  only.
- A change to any model.
- Cups and national teams, which no model predicts (specs/051 S5).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | The shape | **A section `Kilpailuittain` on `/ennusteet`, and each competition's name linking to the page filtered to it (`?kilpailu=`)** | Miikka, 2026-10-01 (Q1): "suggestions good". |
| S2 | The table's measure | **The Brier score only**; the rest on the filtered page | Miikka, 2026-10-01 (Q2). Three models × four measures do not fit 375 px; Brier is specs/054 S9's yardstick. |
| S3 | The best model | **The lowest Brier in each row bold, and a line saying so** | Miikka, 2026-10-01 (Q3). |
| S4 | Columns | **`Kilpailu` · `Ottelut` · one per model** | Miikka, 2026-10-01 (Q4). |
| S5 | Row order | **The site's competition order (tier), not by figures** | Miikka, 2026-10-01 (Q5). |
| S6 | Few matches | **Every competition listed, its count shown** | Miikka, 2026-10-01 (Q6). As specs/049 S10. |
| S7 | The filtered page | **specs/054 S14's minimums as they are** | Miikka, 2026-10-01 (Q7). |
| S8 | Live predictions | **No special case** | Miikka, 2026-10-01 (Q8). |

## UX / UI (Finnish strings)

**`/ennusteet`, a section after specs/054's three:** `Kilpailuittain`

| `Kilpailu` | `Ottelut` | `Perustaso` | `Elo` | `Poisson` |
|---|---|---|---|---|
| Veikkausliiga | 1 520 | 0,612 | **0,598** | 0,603 |
| Ykkönen | 980 | **0,629** | 0,631 | 0,640 |

- Brier scores to three decimals with a comma; the row's lowest bold (S3).
- A competition's name links to `/ennusteet?kilpailu=VL` with the page's
  provider and kind kept.
- Under the table: `Brier-pistemäärä kilpailuittain. Lihavoitu luku on kilpailun paras malli; pienempi on parempi.`
- A model with no judged match in a competition: `–`.

**Filtered** (S1), **proposed, pending Q9**: under the page heading,
`Näytetään vain kilpailu Veikkausliiga.` and a link `Kaikki kilpailut`; the
window line counts that competition's matches only. The `Kilpailuittain`
table stays, the filtered competition's row marked as current.

## API & Data

specs/054's judged predictions, grouped by the `competition_code` each row
already carries (specs/052). Same window, same kind switch, same
both-models-predicted rule (specs/054 S3, S4). `?kilpailu=` filters those rows
to one code before every figure is computed; a code not of the chosen
provider's compared competitions is ignored (the unfiltered page). No new
table, no provider request; the filtered result cached per provider, kind and
competition (specs/054 S11).

## Edge Cases

| Case | Behaviour |
|---|---|
| A competition with few judged matches | Listed, its count shown (S6) |
| A competition with none in the window | No row |
| A model with no judged match in a competition (before Poisson's backtest) | `–` in its cell; no bold among fewer than two models |
| Two models with equal Brier to three decimals | Both bold |
| `?kilpailu=` naming a competition of the other provider, or none | The unfiltered page |
| A filtered page under 200 matches | specs/054 S14: no rolling chart, its count line (S7) |
| The provider switch on a filtered page | Drops the filter: the other provider's page, unfiltered |
| Signed out | specs/054 S12 |

## Performance & Limits

One more grouping over specs/054's rows; within its cache (specs/054 S11).

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] Signed in, `/ennusteet` shows `Kilpailuittain`: a row per compared competition of the chosen provider with a judged match, in the site's competition order, `Ottelut` and each model's Brier score
- [ ] Each row's lowest Brier is bold (ties both), a model without matches shows `–`, and the line under the table explains it
- [ ] A competition's name opens the page filtered to it, provider and kind kept; every figure then counts that competition only, and the page says so with a link back
- [ ] An unknown or other-provider `kilpailu` shows the unfiltered page
- [ ] specs/054's minimums apply to a filtered page
- [ ] No provider request; cached per provider, kind and competition
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/prediction-quality.test.ts` | Grouping by competition; the order; the best mark and its ties; `–` |
| `tests/unit/lib/…service….test.ts` | The filter and the ignored code; the cache key per competition |
| `tests/unit/components/…` | The table, bold, `–`, the line; the filtered page's line and link; the current row |
| `tests/e2e/…` | Signed in, the table, a competition's link and the filtered page |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/056-accuracy-by-competition.md` (this file)
- specs/054's scoring module and page
- `decisions/056-accuracy-by-competition.md`, by the implementing agent

## Open Questions

Q1–Q8 were answered in chat on 2026-10-01 and are recorded as S1–S8. Writing
the rest raised one:

9. **The filtered page's strings**: `Näytetään vain kilpailu {nimi}.`, the
   link `Kaikki kilpailut`, and the filtered competition's row marked as
   current in the table — and three edge-case rules in the table above:
   equal Brier scores are both bold; the provider switch drops the filter;
   an unknown or other-provider `kilpailu` shows the unfiltered page.
   *Proposal: as drafted.*
