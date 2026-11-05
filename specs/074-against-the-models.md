# 074 — Arvauspeli: against the models

## Summary

Each Veikkausliiga match in `Arvauspeli` has the prediction models' own
guesses beside the player's, and a player whose guess does better than the
models earns tokens for it. Builds on specs/072, 076 and 073 (#748).

## Scope

### In scope

- **A model's guess** for each match, taken from its last prediction before
  kickoff (S1, S2).
- **Which models take part** (S3).
- **How a player's guess is compared with a model's**, by specs/072's tiers
  (S4).
- **The reward for beating the models** (S5).
- **Where the models' guesses are shown** (S6).
- The data: Poisson's most likely score kept with its last prediction (S2).

### Out of scope

- New models, or changes to the existing ones or their predictions (#758).
- The models as players on the leaderboard, with balances of their own (S7).
- Any competition but Veikkausliiga.

## Settled decisions

All from Miikka, 2026-11-05: "good recommendations, proceed", on the questions
as suggested.

| # | Decision |
|---|---|
| S1 | **A model's guess is its last live prediction before kickoff**, the row specs/052 S3 freezes at kickoff, so it locks when a player's guess does. Its 1X2 is the outcome it gives the highest probability; a tie goes to `1`, then `X` |
| S2 | **Poisson's score guess is its most likely score** (specs/055 S20, specs/062 C2), **stored with its live prediction** in two new nullable columns and frozen with it |
| S3 | **The four logged models take part:** `Elo`, `Elo + vire`, `Elo + kotietu`, `Poisson`. Not the home-win baseline |
| S4 | **A guess is compared with the model's guess of the same kind, by specs/072's tiers.** A 1X2 guess beats a model when the player's 1X2 is right and the model's wrong. A score guess is compared with Poisson's score only, and beats it when its highest tier (exact > goal difference > 1X2 > miss) is higher than Poisson's |
| S5 | **+10 for each model beaten:** up to +40 for a 1X2 guess, +10 for a score guess |
| S6 | **The models' guesses show after kickoff**, on the player's waiting and settled rows; nothing new before kickoff |
| S7 | **The models are not on the leaderboard** |
| S8 | **The strings below are drafts, fine-tuned in implementation** |

## UX / UI (Finnish strings)

Drafts, fine-tuned in implementation, as in specs/072. The models are named as
`/ennusteet/laatu` names them: `Elo`, `Elo + vire`, `Elo + kotietu`, `Poisson`.

- **A settled guess, `Ratkaistut`:** "Voitit mallit +{n}", when the guess beat
  the models, with the other payments, after the rarity bonus (specs/073); and
  a line after the shares: "Mallit: Elo 1 · Elo + vire 1 · Elo + kotietu X ·
  Poisson 2–1".
- **A guess waiting for its result, `Odottavat tulosta`:** the same models
  line, without a reward.
- **Before kickoff (S6):** nothing new on `Tulevat ottelut`; the models'
  probabilities are on the match page already.
- **A match with no model guess** (no prediction was logged before kickoff):
  no models line.

## API & Data

- **A model's 1X2 guess** is the outcome its last live prediction before
  kickoff gives the highest probability; a tie goes to `1`, then `X`.
- **Poisson's score guess** is its most likely score (specs/055 S20,
  specs/062 C2), written into the same live row as its probabilities, in two
  new nullable columns, and frozen with it at kickoff (specs/052 S3).
- **Settling** (the hourly run, specs/072 S11) judges each model's guess by
  the same tiers as a player's, and pays the reward in the guess's own
  settlement transaction, as a `models` ledger row, one per guess by a unique
  index, as specs/073's bonus.
- **Caching:** none; the predictions are stored rows.

## Edge Cases

| Case | Behaviour |
|---|---|
| No live prediction was logged for a model before kickoff | That model takes no part on that match |
| No model has a guess on the match | No models line, no reward |
| A model's probabilities tie at the top | `1` before `X` before `2` |
| A match postponed | The live row follows it (specs/052 S4); the guess is the last before the new kickoff |
| Void, refunded or awarded guesses (076) | No reward against the models |
| A result corrected after settling | specs/072 S9: not settled again |

## Performance & Limits

One read of at most four prediction rows per match settled. No measurable
load.

## Security & Secrets

No new variables or secrets.

## Logging

- The reward is counted in specs/072's `Arvauspeli guesses settled` line, as
  `modelWins`.
- A match settled with no model guess logs nothing: it is ordinary.
- Ids only.

## Acceptance Criteria

- [ ] Poisson's live prediction stores its most likely score, and the stored row is the one frozen at kickoff
- [ ] A model's 1X2 guess is the outcome of its last live prediction with the highest probability, a tie going to `1`, then `X`
- [ ] After the hourly run, a correct 1X2 guess pays +10 for each of the four models whose 1X2 guess was wrong
- [ ] After the hourly run, a score guess pays +10 when its highest tier is higher than Poisson's score guess's
- [ ] A model with no live prediction before kickoff, or Poisson with no stored score, takes no part on that match
- [ ] A void, refunded or awarded guess earns nothing against the models, and no guess is paid twice
- [ ] A waiting and a settled guess show the models' guesses after kickoff, and a settled one what beating them paid; nothing new shows before kickoff

## Tests Required

- `tests/unit/lib/guessing-game.test.ts` (or a file of its own): a model's
  1X2 at a tie; the comparison of each kind, at each tier; the reward for 0 to
  4 models beaten.
- `tests/unit/lib/prediction-log.test.ts`: Poisson's row carries its most
  likely score; the Elo rows carry none.
- `tests/integration/`: settling pays the reward once, against the stored
  live rows; a match with no live row pays nothing; a void guess earns
  nothing.
- `tests/e2e/`: a settled guess shows the models line and its reward; on an
  empty `_test` database as well.

## Files To Update

- `specs/074-against-the-models.md`
- `specs/052-predictions-log.md` is not edited; decisions/074 says the live
  row gained Poisson's score
- `docs/infrastructure.md` (the hourly run pays the reward)

## Open Questions

None.
