# 056 — Prediction quality by competition: which model works where

> **Status: all questions (Q1–Q9) answered in chat on 2026-10-01; Q10–Q12
> answered on 2026-10-10, read against the code specs/054 and specs/055
> left.** Written for #353, release 3 in the
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
- Every model specs/054's page judges: the baseline, Elo and Poisson
  (specs/055 S18).

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
| S9 | The filtered page | **`Näytetään vain kilpailu {nimi}.`, the link `Kaikki kilpailut`, the filtered row marked current; equal Brier scores both bold; the provider switch drops the filter; an unknown or other-provider `kilpailu` shows the unfiltered page** | Miikka, 2026-10-01 (Q9): "the strings are ok — we can fine tune those during implementation still". |
| S10 | A model without a figure | **Cannot happen, so no `–` cell**: only matches all three models predicted are judged (specs/055 S18), so every row has every model's figure | Miikka, 2026-10-10 (Q10): "questions, as suggested". This spec first drew `–` for Poisson before its backtest; under S18 that state is specs/054's empty line for the whole page. |
| S11 | The kind switch on a filtered page | **Keeps the filter**; a competition with no judged match of that kind shows specs/054's empty line under the filter's line and its link back | Miikka, 2026-10-10 (Q11). The competition is still one of the provider's. |
| S12 | Logging | **No new line; the existing failure line gains the competition code** | Miikka, 2026-10-10 (Q12). |

## UX / UI (Finnish strings)

**`/ennusteet`, a section after specs/054's three:** `Kilpailuittain`

| `Kilpailu` | `Ottelut` | `Perustaso` | `Elo` | `Poisson` |
|---|---|---|---|---|
| Veikkausliiga | 1 520 | 0,612 | **0,598** | 0,603 |
| Ykkönen | 980 | **0,629** | 0,631 | 0,640 |

- Brier scores to three decimals with a comma; the row's lowest bold (S3).
- A competition's name links to the page filtered to it, the page's provider
  and kind kept: `/ennusteet?alue=kotimaa&tyyppi=jalkikateen&kilpailu=VL`,
  `alue` and `tyyppi` as specs/054's page writes them.
- Under the table: `Brier-pistemäärä kilpailuittain. Lihavoitu luku on kilpailun paras malli; pienempi on parempi.`
- The rows in each provider's picker order (S5): `DOMESTIC_COMPETITIONS` by
  tier for `Kotimaa`, `SUPPORTED_COMPETITIONS` for `Ulkomaat`.

**Filtered** (S1, S9): under the page heading,
`Näytetään vain kilpailu Veikkausliiga.` and a link `Kaikki kilpailut`; the
window line counts that competition's matches only. The `Kilpailuittain`
table stays, the filtered competition's row marked as current. The kind
switch keeps the filter and the provider switch drops it (S9, S11).

## API & Data

specs/054's judged predictions, grouped by the `competition_code` each row
already carries (specs/052). Same window, same kind switch, and the same rule
that only matches all three models predicted are judged (specs/054 S3, S4;
specs/055 S18). `?kilpailu=` filters those rows
to one code before every figure is computed; a code not of the chosen
provider's compared competitions is ignored (the unfiltered page). No new
table, no provider request; the filtered result cached per provider, kind and
competition (specs/054 S11).

## Edge Cases

| Case | Behaviour |
|---|---|
| A competition with few judged matches | Listed, its count shown (S6) |
| A competition with none in the window | No row |
| A model with no row for a match (before Poisson's backtest, all of them) | The match is judged under no model (specs/055 S18): no row for a competition without a common match, and specs/054's empty line when there is none at all (S10) |
| Two or three models with equal Brier to three decimals | Each bold |
| `?kilpailu=` naming a competition of the other provider, or none | The unfiltered page |
| A filtered page under 200 matches | specs/054 S14: no rolling chart, its count line (S7) |
| The provider switch on a filtered page | Drops the filter: the other provider's page, unfiltered |
| The kind switch on a filtered page | Keeps the filter (S11) |
| A filtered page with no judged match of the chosen kind | specs/054's empty line, under the filter's line and `Kaikki kilpailut` (S11) |
| The read of a filtered page fails | specs/054's failure line |
| Signed out | specs/054 S12 |

## Performance & Limits

One more grouping over specs/054's rows; within its cache (specs/054 S11).

## Security & Secrets

No new environment variable or secret.

## Logging

The feature only reads. A failed read is already logged at `error` as
`Unable to read the prediction quality` with the provider and the kind
(specs/054); a filtered read adds the competition code to that line (S12). No
action changes shared data, and nothing personal is read or logged.

## Acceptance Criteria

- [ ] Signed in, `/ennusteet` shows `Kilpailuittain`: a row per compared competition of the chosen provider with a judged match, in the site's competition order, `Ottelut` and each model's Brier score
- [ ] Each row's lowest Brier is bold (ties each), and the line under the table explains it
- [ ] A competition's name opens the page filtered to it, provider and kind kept; every figure then counts that competition only, and the page says so with a link back
- [ ] The kind switch keeps the filter and the provider switch drops it; a filtered page with no judged match shows specs/054's empty line with the link back
- [ ] An unknown or other-provider `kilpailu` shows the unfiltered page
- [ ] specs/054's minimums apply to a filtered page
- [ ] No provider request; cached per provider, kind and competition; a failed filtered read logs its competition code
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/prediction-quality.test.ts` | Grouping by competition; the order; the best mark and its ties |
| `tests/unit/lib/…service….test.ts` | The filter and the ignored code; the cache key per competition; the failure line's competition code |
| `tests/unit/components/…` | The table, bold, the line; the filtered page's line and link; the current row; the two switches' links on a filtered page; the empty filtered page |
| `tests/e2e/…` | Signed in, the table, a competition's link and the filtered page |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/056-accuracy-by-competition.md` (this file)
- specs/054's scoring module and page
- `decisions/056-accuracy-by-competition.md`, by the implementing agent

## Open Questions

**None.** Q1–Q9 were answered in chat on 2026-10-01 and are recorded as
S1–S9; Q10–Q12 on 2026-10-10, as S10–S12. The strings may still be fine-tuned during implementation.
