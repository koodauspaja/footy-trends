# 055 — Poisson goal model: expected goals, every scoreline, and a fairer draw

> **Status: all questions (Q1–Q15) answered in chat on 2026-10-01; S1, S2, S4, S5 and
> S11 revised the same day after #515's measurement.** Written for #345 (Poisson goal
> model) and #348 (a draw-specific model), joined: the draw correction is a
> part of the Poisson model, not a model of its own. Release 3 in the
> predictions plan, after Elo (specs/053) and prediction quality
> (specs/054).

## Summary

Elo says which side is stronger; it says nothing about goals. A Poisson model
predicts **how many goals** each side scores: every team carries an attack and
a defence strength, the two meet in an expected goal count for each side, and
from those comes the probability of every scoreline — 0–0, 1–0, 2–1 — and so of
a home win, a draw and an away win.

Plain Poisson treats the two sides' goals as independent, and so predicts too
few draws, low-scoring ones above all. #348 is that correction.

Its predictions are logged as a third model beside the baseline and Elo, and
specs/054's page measures all three on the same matches.

## Scope

### In scope

- Attack and defence strengths for every team of specs/051's competitions,
  fitted from stored results only (Q1–Q4, revised after #515).
- Expected goals and the scoreline distribution for an upcoming match, and the
  three outcomes from it (Q5).
- The draw correction (#348, Q6).
- Logged as `poisson-v1`, live and backtested (specs/052); shown in `Ennuste`
  (Q8, Q9) and measured on `/ennusteet` (specs/054 S2).

### Out of scope

- Any team-strength chart (Elo's panel covers strength over time).
- Player, xG or event data: result-level only.
- Choosing which model the site trusts — specs/054's figures, then #480.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Strengths | **Fitted**: an attack and a defence per team, a base rate per competition and one home advantage per provider, by weighted maximum likelihood of the scores (Dixon–Coles's strengths, without its ρ) | Miikka, 2026-10-01 (Q1, revised after #515). Q1 first chose averages for simplicity. #515 then measured the fit as better than averages in every season of both providers (Brier 0.5873 → 0.5624 TASO, 0.6123 → 0.6003 football-data), and better than Elo too. |
| S2 | Window | **Every covered match of the team's provider in the last 1 500 days, weighted by a half-life of about a year** (ξ = 0.0019 per day) | Miikka, 2026-10-01 (Q2, revised after #515): replaces "the last 20 matches". The textbook values, not tuned on this history. |
| S3 | What a strength spans | **One per team across its provider's covered competitions**, each match measured against its own competition's base rate | Miikka, 2026-10-01 (Q3). As specs/053 S1. |
| S4 | Few matches | **A prior of one average match pulls every strength towards average**; no history predicts as an average side | Miikka, 2026-10-01 (Q4, revised after #515): replaces "shrunk by matches / 20". |
| S5 | Expected goals | **Home: e^(competition base + home advantage + home attack + away defence); away: e^(competition base + away attack + home defence)** | Miikka, 2026-10-01 (Q5, revised after #515): the same product of strengths as first agreed, now on a log scale and fitted. |
| S6 | Draws (#348) | **The draw cells scaled so the model's average draw probability over the competition's history equals its draw share**, the rest renormalised; one factor per competition | Miikka, 2026-10-01 (Q6). Consistent with specs/053 S4. Dixon–Coles's ρ was measured in #515 and left out: it fitted to about 0 on TASO and moved football-data's Brier by 0.0003. |
| S7 | Scorelines | **0–10 goals a side**, the remainder spread back proportionally | Miikka, 2026-10-01 (Q7). |
| S8 | Ennuste | **A third row, `Poisson`, after `Elo`, and a line with the expected goals and the most likely score** | Miikka, 2026-10-01 (Q8). |
| S9 | More scorelines | **Only the most likely score**; a scoreline grid is #514 | Miikka, 2026-10-01 (Q9). |
| S10 | Team page | **No panel** | Miikka, 2026-10-01 (Q10). |
| S11 | Computing | **Fitted in memory, cached per provider 15 minutes; the hourly run and the backtest fit for themselves.** A fit takes milliseconds; the backtest refits once per calendar day of matches | Miikka, 2026-10-01 (Q11, revised after #515). As specs/053 S11, S17. #515 measured 8–30 ms a fit, about 12 s for a provider's whole backtest. |
| S12 | Backtest | **Strengths from matches on strictly earlier days; base rates and the draw factor from strictly earlier matches** | Miikka, 2026-10-01 (Q12). specs/052 S14. A day's matches share one fit, which uses none of them. |
| S13 | The strings | **As in UX / UI**; a failed replay shows `Poisson-mallia ei voitu laskea. Yritä myöhemmin uudelleen.` under the table, the other rows kept | Miikka, 2026-10-01 (Q13): "suggestions are good". |
| S14 | No draw factor | **A competition with no draws ever, or only draws, uses the plain Poisson grid** | Miikka, 2026-10-01 (S14). Possible only with very little history. |
| S15 | A placeholder side | **No `Poisson` row**, as specs/053 | Miikka, 2026-10-01 (S15). |

## UX / UI (Finnish strings)

`Ennuste` (specs/051, specs/053) gains a row:

| | Kotivoitto | Tasapeli | Vierasvoitto |
|---|---|---|---|
| `Perustaso` | `45 %` | `26 %` | `29 %` |
| `Elo` | `43 %` | `26 %` | `31 %` |
| `Poisson` | `48 %` | `27 %` | `25 %` |

After the Elo line:
`Poisson: odotetut maalit {koti} 1,6 – {vieras} 1,1; todennäköisin tulos 1–1 (12 %).`
— expected goals to one decimal with a comma, the score's probability a whole
percentage.

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| Finished matches | specs/052's `readFinished`, with teams and season (specs/053) |
| The fit | Every covered match of the provider in the 1 500 days before the moment asked, each weighted by e^(−0.0019 × its age in days) (S2): the competition base rates, the home advantage and each team's attack and defence that make the scores most likely, a one-match prior towards average on each strength (S1, S3, S4) |
| The draw factor | From the competition's stored history (S6) |
| Expected goals | S5 |
| Scoreline grid | Independent Poisson probabilities 0–10 × 0–10, the remainder spread back (S7); draw cells × the competition's factor, renormalised (S6) |
| The three outcomes | Sums of the grid's cells below, on and above the diagonal |
| Most likely score | The grid's largest cell; a tie goes to the fewer total goals, then the home side's |
| Log | `poisson-v1`, live (hourly run) and backtest, beside the other two models |
| Cache | The page's replay per provider, 15 minutes (S11) |

## Edge Cases

| Case | Behaviour |
|---|---|
| A team with no covered match | Average attack and defence (S4) |
| A team with few matches | Pulled towards average by the prior (S4) |
| A match more than 1 500 days old | Not in the fit (S2) |
| A competition with no finished match | No Poisson prediction, as the baseline gives none (specs/051 S9) |
| A competition with no draw ever, or only draws | No draw factor can be found; the plain Poisson grid is used (S14) |
| A shoot-out | A draw, its goals after extra time (specs/049 S3) |
| A placeholder side | No Poisson row, as specs/053 (S15) |
| Matches at one kickoff | Each from strengths before any of them (S12) |
| The replay fails | `Ennuste` keeps its other rows and shows the S13 failure line |
| Signed out | No probability in the HTML (specs/051 S4) |

## Performance & Limits

A fit is a few passes over at most 1 500 days of one provider's matches; #515
measured 8–30 ms, warm-started. The backtest fits once per calendar day:
about 12 s for TASO and 8 s for football-data. Each prediction adds a 121-cell
grid. Measured against staging again before review (S11).

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] Attack, defence, the competition base rates and the home advantage are fitted by weighted maximum likelihood over the last 1 500 days, a half-life of about a year, with a one-match prior towards average
- [ ] Expected goals follow S5; the grid covers 0–10 a side, its draw cells scaled by the competition's factor so its average draw probability equals the competition's draw share
- [ ] The three outcomes sum the grid, and the most likely score is its largest cell
- [ ] Everything a backtest prediction uses comes from strictly earlier matches
- [ ] The backtest's `poisson-v1` figures on specs/054's measures are within rounding of #515's `dc-strengths` prototype (Brier 0.5624 TASO, 0.6003 football-data, on specs/054's window), or the difference is explained in the decision record
- [ ] `poisson-v1` is logged beside the other two models, live and backtested
- [ ] Signed in, `Ennuste` shows a `Poisson` row after `Elo`, and the line with expected goals and the most likely score
- [ ] A failed replay keeps the other rows and shows the Finnish failure line; signed out, no probability is in the HTML
- [ ] No provider request; cached per provider for 15 minutes; its cost measured and written down
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/poisson.test.ts` | The fit recovers known strengths from generated scores; the weights, the 1 500-day horizon and the prior; expected goals; the grid and its remainder; the draw factor; the three sums; the most likely score and its tie rule |
| `tests/unit/lib/prediction-*.test.ts` | `poisson-v1` live and backtest rows; strictly-earlier history |
| `tests/unit/components/match-prediction.test.tsx` | The third row and the line; a failed replay; a placeholder |
| `tests/integration/…` | The backtest's `poisson-v1` rows against Postgres, a shoot-out a draw |
| By hand, before review | The backtest on staging, read-only, scored with specs/054's module and compared with #515's figures |
| `tests/e2e/…` | The seeded upcoming match shows three rows and the Poisson line |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/055-poisson-goal-model.md` (this file)
- A pure model module, its service, the predictions run and backtest, and
  `Ennuste`
- `decisions/055-poisson-goal-model.md`, by the implementing agent

## Open Questions

**None.** Q1–Q15 were answered in chat on 2026-10-01 and are recorded as
S1–S15. #514 and #515 were filed from them. #515 measured the alternatives the
same day, and Miikka took its recommendation: fitted strengths, no ρ (S1, S2,
S4, S5, S6, S11).
