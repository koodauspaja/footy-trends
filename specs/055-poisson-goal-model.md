# 055 — Poisson goal model: expected goals, every scoreline, and a fairer draw

> **Status: Q1–Q12 answered in chat on 2026-10-01; the strings and three
> edge-case rules (Q13–Q15) proposed, awaiting confirmation.** Written for #345 (Poisson goal
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
  from stored results only (Q1–Q4).
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
| S1 | Strengths | **Averages**: attack = goals scored per match ÷ the competition's, defence = goals conceded per match ÷ the competition's | Miikka, 2026-10-01 (Q1). Simple and explainable; whether a fitted Dixon–Coles model earns a v2 is #515. |
| S2 | Window | **The team's last 20 covered matches**, whatever season | Miikka, 2026-10-01 (Q2). |
| S3 | What a strength spans | **One per team across its provider's covered competitions**, each match measured against its own competition's averages | Miikka, 2026-10-01 (Q3). As specs/053 S1. |
| S4 | Few matches | **Shrunk towards 1.0 by matches / 20**; no history predicts as an average side | Miikka, 2026-10-01 (Q4). |
| S5 | Expected goals | **Home: competition's home goals per match × home attack × away defence; away: its away goals per match × away attack × home defence**, the averages from all stored history | Miikka, 2026-10-01 (Q5). As specs/051 S2. |
| S6 | Draws (#348) | **The draw cells scaled so the model's average draw probability over the competition's history equals its draw share**, the rest renormalised; one factor per competition | Miikka, 2026-10-01 (Q6). Consistent with specs/053 S4; the Dixon–Coles ρ alternative is in #515. |
| S7 | Scorelines | **0–10 goals a side**, the remainder spread back proportionally | Miikka, 2026-10-01 (Q7). |
| S8 | Ennuste | **A third row, `Poisson`, after `Elo`, and a line with the expected goals and the most likely score** | Miikka, 2026-10-01 (Q8). |
| S9 | More scorelines | **Only the most likely score**; a scoreline grid is #514 | Miikka, 2026-10-01 (Q9). |
| S10 | Team page | **No panel** | Miikka, 2026-10-01 (Q10). |
| S11 | Computing | **Replayed in memory, cached per provider 15 minutes; the hourly run and the backtest replay for themselves** | Miikka, 2026-10-01 (Q11). As specs/053 S11, S17. |
| S12 | Backtest | **Strengths, averages and the draw factor all from strictly earlier matches** | Miikka, 2026-10-01 (Q12). specs/052 S14. |

## UX / UI (Finnish strings)

**Proposed, pending Q13.** `Ennuste` (specs/051, specs/053) gains a row:

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
| Competition averages | Home and away goals per match over all stored history (S5); the draw factor from the same history (S6) |
| A team's strengths | Its last 20 covered matches before the moment asked (S2): goals for and against each divided by that match's competition average at that venue, averaged, shrunk by matches / 20 (S3, S4) |
| Expected goals | S5 |
| Scoreline grid | Independent Poisson probabilities 0–10 × 0–10, the remainder spread back (S7); draw cells × the competition's factor, renormalised (S6) |
| The three outcomes | Sums of the grid's cells below, on and above the diagonal |
| Most likely score | The grid's largest cell; a tie goes to the fewer total goals, then the home side's |
| Log | `poisson-v1`, live (hourly run) and backtest, beside the other two models |
| Cache | The page's replay per provider, 15 minutes (S11) |

## Edge Cases

| Case | Behaviour |
|---|---|
| A team with no covered match | Strengths 1.0, an average side (S4) |
| A team with fewer than 20 | Shrunk by matches / 20 (S4) |
| A competition with no finished match | No Poisson prediction, as the baseline gives none (specs/051 S9) |
| A competition with no draw ever, or only draws | No draw factor can be found; the plain Poisson grid is used (Q14) |
| A shoot-out | A draw, its goals after extra time (specs/049 S3) |
| A placeholder side | No Poisson row, as specs/053 (Q15) |
| Matches at one kickoff | Each from strengths before any of them (S12) |
| The replay fails | `Ennuste` keeps its other rows and shows a failure line (Q13) |
| Signed out | No probability in the HTML (specs/051 S4) |

## Performance & Limits

A replay keeps each team's last 20 matches and each competition's running
averages: one pass over about 28 000 matches, plus a 121-cell grid per
prediction. Measured against staging before review (S11).

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] A team's attack and defence are its last 20 covered matches' goals for and against, each against that match's competition average at that venue, shrunk towards 1.0 by matches / 20
- [ ] Expected goals follow S5; the grid covers 0–10 a side, its draw cells scaled by the competition's factor so its average draw probability equals the competition's draw share
- [ ] The three outcomes sum the grid, and the most likely score is its largest cell
- [ ] Everything a backtest prediction uses comes from strictly earlier matches
- [ ] `poisson-v1` is logged beside the other two models, live and backtested
- [ ] Signed in, `Ennuste` shows a `Poisson` row after `Elo`, and the line with expected goals and the most likely score
- [ ] A failed replay keeps the other rows and shows the Finnish failure line; signed out, no probability is in the HTML
- [ ] No provider request; cached per provider for 15 minutes; its cost measured and written down
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/poisson.test.ts` | Strengths by hand, the 20-match window and shrinkage, expected goals, the grid and its remainder, the draw factor, the three sums, the most likely score and its tie rule |
| `tests/unit/lib/prediction-*.test.ts` | `poisson-v1` live and backtest rows; strictly-earlier history |
| `tests/unit/components/match-prediction.test.tsx` | The third row and the line; a failed replay; a placeholder |
| `tests/integration/…` | The backtest's `poisson-v1` rows against Postgres, a shoot-out a draw |
| `tests/e2e/…` | The seeded upcoming match shows three rows and the Poisson line |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/055-poisson-goal-model.md` (this file)
- A pure model module, its service, the predictions run and backtest, and
  `Ennuste`
- `decisions/055-poisson-goal-model.md`, by the implementing agent

## Open Questions

Q1–Q12 were answered in chat on 2026-10-01 and are recorded as S1–S12. #514
(the scoreline grid) and #515 (whether Dixon–Coles earns a v2) were filed from
them. Writing the rest raised three, proposed here:

13. **The strings**: the `Poisson` row and its line as in UX / UI, and when the
    replay fails, `Poisson-mallia ei voitu laskea. Yritä myöhemmin uudelleen.`
    under the table, the other rows kept. *Proposal: as drafted.*
14. **A competition with no draws ever, or only draws**, has no factor that
    reaches its draw share. *Proposal: use the plain Poisson grid there, and
    say so in the decision record — it can only happen with very little
    history.*
15. **A placeholder side**: no `Poisson` row, as Elo has none. *Proposal: as
    stated.*
