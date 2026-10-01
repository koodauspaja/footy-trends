# 059 — Predictions for cup competitions

> **Status: Q1–Q9 answered in chat on 2026-10-01; the one string and two
> edge-case rules (Q10) proposed. Strings may be fine-tuned during
> implementation.** Written for #516, release 4 in the
> predictions plan. Filed on 2026-10-01 from specs/058 S2: a rivalry's next
> meeting may be a cup tie, and no model predicts one.

## Summary

Every model so far — the baseline (specs/051), Elo (specs/053), Poisson
(specs/055) — predicts only the leagues and the Champions League (specs/051
S5). The Finnish cups are where the tiers meet: Veikkausliiga sides play
Ykkönen and Kakkonen ones, and a fan wants to know how likely the upset is.
This extends the three models to the domestic cups, so a cup tie gets an
`Ennuste`, a rivalry's next cup meeting gets a prediction (specs/058), and the
cups are judged on `/ennusteet` (specs/054, specs/056).

## Scope

### In scope

- Predictions for the two Suomen Cups' ties (S1), by all three models (S2–S5).
- Logged live and backtested (specs/052).
- The places that read predictions: `Ennuste`, specs/058's rivalry group,
  `/ennusteet` (S7, S8).

### Out of scope

- National teams (specs/045 S5).
- Any change to how the leagues are predicted (S2).
- Liigacup and Ykkösliigacup (S1).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Which cups | **`Miesten Suomen Cup` and `Naisten Suomen Cup` only; Liigacup and Ykkösliigacup left out** | Miikka, 2026-10-01 (Q1): "suomen cups only, liigacups left out". |
| S2 | Elo and cups | **Cup ties are predicted from the league ratings and do not update them; `elo-v1` unchanged** | Miikka, 2026-10-01 (Q2). Cup sides are often rotated, and a rating rule change would be `elo-v2`. |
| S3 | Unrated teams | **A cup tie is predicted only when both sides have played a covered match; otherwise no prediction, and nothing said** | Miikka, 2026-10-01 (Q3). An unrated regional side at 1500 would be far too strong. |
| S4 | A cup's baseline and draw share | **Each cup's own history, a shoot-out a draw; no finished match, no prediction** | Miikka, 2026-10-01 (Q4). As specs/051 S2, S9. |
| S5 | Poisson in a cup | **League-made strengths; the cup's own home and away goals per match, and its own draw factor** | Miikka, 2026-10-01 (Q5). specs/055 S5, S6. |
| S6 | Neutral venues | **The side TASO lists at home is treated as at home; said in the decision record** | Miikka, 2026-10-01 (Q6). TASO marks no neutral venue. |
| S7 | `/ennusteet` | **Each cup its own row in `Kilpailuittain`; not in the provider-wide figures, and a line says so** | Miikka, 2026-10-01 (Q7). The leagues' figures do not shift when cups arrive. |
| S8 | specs/058 | **A cup tie as the rivalry's next meeting is predicted, within S3** | Miikka, 2026-10-01 (Q8). Lifts specs/058 S2 and the cup half of S10. |
| S9 | Backtest | **Re-run per environment after release** | Miikka, 2026-10-01 (Q9). specs/052 S10. |

## UX / UI (Finnish strings)

No new screen: a Suomen Cup tie's match page gets `Ennuste` as a league
match does; specs/058's group predicts a cup meeting (S8).

One line, under specs/056's `Kilpailuittain` when a cup row is listed (S7),
**proposed, pending Q10**:
`Suomen Cupit näytetään omina riveinään, eivätkä ne sisälly yllä oleviin kokonaislukuihin.`

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| Which matches are predicted | specs/051 S5's set plus `MSC` and `NSC` (S1), each cup tie filed by its season's pair (specs/049) |
| Rated or not | Each side has a stored finished match in a covered **league** or the Champions League (S3) |
| The baseline | The cup's own outcome shares over its stored history (S4) |
| Elo | `predictElo` from the league ratings, the cup's draw share (S2, S4); cup results never passed to the replay |
| Poisson | League-made strengths; the cup's goal averages and draw factor (S5) |
| Log | The same three models, live and backtest; the backtest re-run per environment (S9) |
| `/ennusteet` | Cups excluded from the provider-wide figures, each its own `Kilpailuittain` row (S7) |

## Edge Cases

| Case | Behaviour |
|---|---|
| A tie with a side from an uncovered division | No prediction, nothing said (S3) |
| A tie between two covered sides of different tiers | Predicted from their league ratings — the cross-tier case the cups exist for |
| A Liigacup or Ykkösliigacup tie | No prediction (S1) |
| A tie settled on penalties | A draw for every model's history (specs/049 S3) |
| A final at a neutral ground | The listed home side at home (S6) |
| A cup with no finished match yet | No prediction (S4) |
| A cup's draw share of 0 or 1 | specs/055 S14: the plain Poisson grid; the baseline and Elo use it as it is (Q10) |
| A placeholder side (TASO's unresolved bracket slot) | No prediction, as specs/053 |
| The rivalry page's next meeting a cup tie | Predicted within S3 (S8) |

## Performance & Limits

A few hundred more matches per season in each replay.

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] An upcoming Miesten or Naisten Suomen Cup tie between two sides with a covered league match shows `Ennuste` with every live model; a tie with an unrated side, or a Liigacup or Ykkösliigacup tie, shows none
- [ ] The baseline, and Elo's and Poisson's draw share and goal averages, come from the cup's own history; strengths and ratings come from the leagues only
- [ ] Cup results never move an Elo rating, and every league prediction is unchanged
- [ ] The hourly run logs cup ties; the backtest, re-run, writes their rows from strictly earlier matches
- [ ] `/ennusteet` lists each cup as its own `Kilpailuittain` row, keeps it out of the provider-wide figures, and says so
- [ ] A rivalry's next meeting in a Suomen Cup is predicted (specs/058)
- [ ] No provider request
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/home-baseline.test.ts` and the models' | MSC and NSC covered, LC and M1LCUP not; the rated rule; cup averages; ratings untouched by cups |
| `tests/unit/lib/prediction-*.test.ts` | Cup ties logged and backtested; an unrated side skipped |
| `tests/unit/lib/prediction-quality.test.ts` | Cups apart from the provider figures, in their own rows |
| `tests/integration/…` | A Suomen Cup tie's rows against Postgres; a shoot-out a draw |
| `tests/e2e/…` | A seeded Suomen Cup tie's `Ennuste`; one with an unrated side has none |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/059-cup-predictions.md` (this file)
- The covered-competition set and each model's handling of a cup tie
- `decisions/059-cup-predictions.md`, by the implementing agent

## Open Questions

Q1–Q9 were answered in chat on 2026-10-01 and are recorded as S1–S9. Writing
the rest raised one:

10. **The `/ennusteet` line** in UX / UI, and two rules: "rated" means a
    stored finished match in a covered **league** or the Champions League —
    not another cup tie; and a cup whose draw share is 0 or 1 uses it as it
    is for the baseline and Elo, and the plain grid for Poisson (specs/055
    S14). *Proposal: as stated.*
