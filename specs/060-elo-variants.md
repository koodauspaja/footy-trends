# 060 — Elo variants: recent form, and each team's own home advantage

> **Status: Q1–Q10 answered in chat on 2026-10-01; S9 reworded and S11–S13
> added on 2026-10-14, re-read against `main` after specs/055 to 059, and the
> spec confirmed the same day. Strings may be fine-tuned during implementation.**
> Written for #346, release 4 in the
> predictions plan. Two variants of specs/053's Elo, filed together because
> they change the same rating loop. The plan said they are worth having only
> if specs/054's measurements show room for Elo to improve (Q9).

## Summary

`elo-v1` treats every result the same however old, and gives every home side
the same 60 points. Two things a fan knows are not true: a side on a run
plays better than its season-long rating, and some grounds are much harder
to visit than others. Each variant adds one of these to Elo, and is logged as
its own model, so specs/054's page can say whether it actually predicts
better than plain Elo.

## Scope

### In scope

- **Form-weighted Elo**: recent results count for more (S2).
- **Home-adjusted Elo**: each team's home advantage learned from its own home
  results, instead of a flat 60 (S3).
- Both logged as models of their own, live and backtested, and measured on
  `/ennusteet` (S1, S5, S6).

### Out of scope

- Replacing `elo-v1`: it stays as it is, the yardstick for both (S1).
- Showing the variants in `Ennuste` (S5).
- Margin of victory, or any other Elo change #346 does not name.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | One model or two | **Two: `elo-form-v1` and `elo-home-v1`; `elo-v1` unchanged beside them** | Miikka, 2026-10-01 (Q1): "all good". |
| S2 | Form | **A form term at prediction: `20 × Σ (S − E)` over the team's last five matches, added to its rating; the rating itself unchanged** | Miikka, 2026-10-01 (Q2). The site's form window (specs/047 S2). |
| S3 | Each team's home advantage | **Starts at 60; after each home match moves by `4 × (S − E)`; kept within 0–150; the away side's rating unaffected** | Miikka, 2026-10-01 (Q3). |
| S4 | Seasons | **Form counts the current season only; a home advantage carries over, a third of the way back to 60** | Miikka, 2026-10-01 (Q4). As specs/053 S3. |
| S5 | `Ennuste` | **Not shown; logged and measured only** | Miikka, 2026-10-01 (Q5). A variant reaches `Ennuste` only by replacing `elo-v1`, decided after the measurements. |
| S6 | `/ennusteet` | **Beside the other models in every figure and in `Kilpailuittain`; the table scrolls within itself at 375 px** | Miikka, 2026-10-01 (Q6). |
| S7 | Backtest | **Both, from strictly earlier matches, re-run per environment after release** | Miikka, 2026-10-01 (Q7). specs/052 S14. |
| S8 | Constants | **Window 5, weight 20, home K 4, bounds 0–150, fixed in `-v1`** | Miikka, 2026-10-01 (Q8). |
| S9 | When to build | **Not gated on a date: the variants are judged on the backtest from the day they ship and on live rows as these accumulate.** Overrides the wait for a few weeks of live predictions of 2026-10-01 | Miikka, 2026-10-14 (Q3): "Backtests are enough; S9 reworded (Recommended)". `elo-v1` had about two weeks of live rows and `poisson-v1` two days; both have backtests. |
| S10 | Names | **`Elo + vire` (`elo-form-v1`) and `Elo + kotietu` (`elo-home-v1`), after `Elo`** | Miikka, 2026-10-01 (Q10). |
| S11 | Cup ties (specs/059) | **Both variants predict the same matches `elo-v1` does, cup ties included, from league state, without updating it: a cup tie moves no rating, form or home advantage, and the form window and home advantage count league matches only** | Miikka, 2026-10-14 (Q2): "Yes, from league state, no update (Recommended)". specs/059 S2 for `elo-v1`; a model that skipped cups would drop cup ties from every figure, since only matches all models predicted are judged. |
| S12 | Logging | **Nothing new** | Miikka, 2026-10-14 (Q1): "Both 'nothing new' (Recommended)". The hourly run's `info` line already counts the rows it writes, and every failure is logged where it is today. |
| S13 | Caching | **Nothing new** | Miikka, 2026-10-14 (Q1). The models read through their existing reads. |
| S14 | Lines on `/ennusteet` | **Two new dash patterns, every line still the foreground colour: `Elo + vire` long-dashed, `Elo + kotietu` dash-dot-dotted; each named in its legend** | Miikka, 2026-10-14 (Q1 of the build): "Two new dash patterns (Recommended)". The charts tell lines apart by dash, not colour; the per-model lines under each chart carry the figures in words. |
| S15 | The home advantage's expectation | **`E` is the variant's own, with the team's home advantage in place of 60; the ratings are `elo-v1`'s, unchanged** | Miikka, 2026-10-14 (Q2 of the build): "Its own E, ratings stay elo-v1's (Recommended)". One rating replay, so `elo-v1` is unchanged by construction. |
| S16 | The live figures | **Judged on the matches all five models predicted, as every figure is: the live tab restarts from the release and fills as matches finish; the backtest keeps the full comparison meanwhile** | Miikka, 2026-10-14 (Q3 of the build): "Accept, as S9 says (Recommended)". |

## UX / UI (Finnish strings)

Only on `/ennusteet` (S5, S6): the variants' names in its legends, tables and
`Kilpailuittain` columns, (S10): `Elo + vire` for
`elo-form-v1` and `Elo + kotietu` for `elo-home-v1`, after `Elo`. In the line
charts `Elo + vire` is long-dashed and `Elo + kotietu` dash-dot-dotted (S14).

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| The ratings | specs/053's replay, unchanged, over the same matches |
| Form (`elo-form-v1`) | Per team, its last five matches of the current season, each `S − E` as Elo computed it at kickoff; the term `20 × Σ` added to its rating before the expectation (S2, S4) |
| Home advantage (`elo-home-v1`) | Per team, from 60, updated after each of its home matches by `4 × (S − E)`, `E` the variant's own (S15), clamped 0–150, regressed a third towards 60 at its first match of a new season (S3, S4) — used in place of the flat 60 for that team's home matches; the ratings are `elo-v1`'s |
| Three outcomes | specs/053 S4's rule, the competition's draw share |
| Log | Both models live (hourly run) and backtested (S7) |

## Edge Cases

| Case | Behaviour |
|---|---|
| A team's first match of a season | No form term (S4) |
| Fewer than five matches this season | The term over those it has |
| A team never at home yet | Home advantage 60 |
| A home advantage that would pass 150 or fall below 0 | Clamped (S3) |
| A new season | Home advantage a third of the way back to 60 (S4) |
| Matches at one kickoff | Each from the state before any of them, as specs/053 S14 |
| A placeholder side | No row, as specs/053 |
| A cup tie (specs/059) | Predicted from league state, nothing updated (S11) |
| A team's first league match of a season, with cup ties played before it | No form term: cup ties are not in the window (S11) |

## Performance & Limits

Two more replays of about 28 000 matches, each milliseconds (decisions/053).

## Security & Secrets

No new environment variable or secret.

## Logging

None new (S12): the hourly run's `info` line counts the rows it writes, both
variants' and cup ties' included, and a failure is logged where it is today.
No personal data.

**Caching:** nothing new (S13).

## Acceptance Criteria

- [ ] `elo-form-v1` adds `20 × Σ (S − E)` over the team's last five current-season matches to its rating at prediction, the rating itself unchanged
- [ ] `elo-home-v1` gives each team its own home advantage, from 60, moved by `4 × (S − E)` after each home match, within 0–150, regressed a third towards 60 each season
- [ ] `elo-v1`'s predictions are unchanged
- [ ] Both predict a cup tie from league state and move no rating, form or home advantage on one
- [ ] Both are logged live and backtested from strictly earlier matches
- [ ] `/ennusteet` shows both beside the other models in every figure and in `Kilpailuittain`; `Ennuste` does not
- [ ] No provider request
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/elo.test.ts` | The form term by hand, its window and season reset; the home advantage's update, clamp and regression; `elo-v1` unchanged |
| `tests/unit/lib/prediction-*.test.ts` | Both models logged and backtested |
| `tests/unit/lib/prediction-quality.test.ts` | Five models in every figure |
| `tests/integration/…` | Both backtests against Postgres |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/060-elo-variants.md` (this file)
- specs/053's rating module, the predictions run and backtest, `/ennusteet`
- `decisions/060-elo-variants.md`, by the implementing agent

## Open Questions

**None.** Q1–Q10 were answered on 2026-10-01 and are S1–S10; the three
questions of 2026-10-14 (S9 reworded, S11, and S12–S13) are answered too, and
the spec is confirmed. The three the build raised the same day are S14–S16.
