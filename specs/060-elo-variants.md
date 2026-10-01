# 060 — Elo variants: recent form, and each team's own home advantage

> **Status: all questions (Q1–Q10) answered in chat on 2026-10-01. Strings may
> be fine-tuned during implementation. Built once specs/054 has a few weeks of
> live predictions (S9).** Written for #346, release 4 in the
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
| S9 | When to build | **Spec now; build once specs/054 has a few weeks of live predictions** | Miikka, 2026-10-01 (Q9). #346 waits in Backlog until then. |
| S10 | Names | **`Elo + vire` (`elo-form-v1`) and `Elo + kotietu` (`elo-home-v1`), after `Elo`** | Miikka, 2026-10-01 (Q10). |

## UX / UI (Finnish strings)

Only on `/ennusteet` (S5, S6): the variants' names in its legends, tables and
`Kilpailuittain` columns, (S10): `Elo + vire` for
`elo-form-v1` and `Elo + kotietu` for `elo-home-v1`, after `Elo`.

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| The ratings | specs/053's replay, unchanged, over the same matches |
| Form (`elo-form-v1`) | Per team, its last five matches of the current season, each `S − E` as Elo computed it at kickoff; the term `20 × Σ` added to its rating before the expectation (S2, S4) |
| Home advantage (`elo-home-v1`) | Per team, from 60, updated after each of its home matches by `4 × (S − E)`, clamped 0–150, regressed a third towards 60 at its first match of a new season (S3, S4) — used in place of the flat 60 for that team's home matches |
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

## Performance & Limits

Two more replays of about 28 000 matches, each milliseconds (decisions/053).

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] `elo-form-v1` adds `20 × Σ (S − E)` over the team's last five current-season matches to its rating at prediction, the rating itself unchanged
- [ ] `elo-home-v1` gives each team its own home advantage, from 60, moved by `4 × (S − E)` after each home match, within 0–150, regressed a third towards 60 each season
- [ ] `elo-v1`'s predictions are unchanged
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

**None.** Q1–Q10 were answered in chat on 2026-10-01 and are recorded as
S1–S10.
