# 074 — Arvauspeli: against the models: decisions

Feature #758, `specs/074-against-the-models.md`. Each Veikkausliiga match in
`Arvauspeli` has the four prediction models' guesses beside the player's, shown
once it has kicked off, and the hourly run pays +10 for each model a player's
guess beat.

| Decision | Why |
|---|---|
| A model's guess is read from its `live` row in `predictions` (`source` `taso`), which specs/052 S3 keeps writing until kickoff and never after. Its 1X2 is the outcome with the highest probability, a tie to `1`, then `X` | S1. The row the hourly run freezes is already the model's last word before kickoff, so no snapshot of its own is needed |
| `predictions` gains `predicted_home_goals` and `predicted_away_goals`, migration `0026_add_predictions_poisson_score`. `poissonLiveRow` writes `predictPoisson`'s `score`, the same most likely score the match page shows, and the upsert keeps them current until kickoff. Every other row, and every backtest row, leaves them null | S2. Specs/052 is not edited: the live row's purpose is unchanged, and it now carries one more figure for Poisson. A null pair means no score guess, so a row written before this, or a fit that fails, compares nothing |
| The four models are `GAME_MODELS`, in a module of their own, `guessing-game-models.ts`, in the order shown: `elo-v1`, `elo-form-v1`, `elo-home-v1`, `poisson-v1`. A row of any other model is left out | S3. The rules the browser's form imports stay free of the models' modules |
| `modelsBeaten`: a 1X2 guess that was right beats each model whose 1X2 was wrong; a score guess beats each model with a score, which is Poisson, whose tier by specs/072's `judge` is lower than its own. Poisson's 1X2 still counts against a 1X2 guess | S4 |
| The reward is `10 × models beaten`, written in each match's settling transaction after its rewards and 073's bonus, as one `models` ledger row per guess, only above 0. A partial unique index, `game_ledger_models_idx`, migration `0027_add_game_models_index`, holds one per guess | S5. As 073's bonus: a racing run cannot pay twice |
| Only guesses that transaction settled as played earn it: `reward` settlements other than `awarded`. The match's live rows are read once, and only when there is such a guess | S5 and the spec's edge cases. An abandoned, void or awarded guess was not judged against a result the models could be judged by |
| The run's summary counts `modelWins`, the guesses that earned the reward | The spec's Logging |
| The page reads the models' guesses in `readOthers`, beside the shares, for the reader's matches that have kicked off: `Mallit: Elo 1 · Elo + vire 1 · Elo + kotietu X · Poisson 2–1`, Poisson by its score, with the names `/ennusteet/laatu` gives them (`MODEL_LABELS`). A failed read leaves the line out and logs `Reading the models' Arvauspeli guesses failed` | S6. One reader, `readModelGuesses`, serves the page and settling, so what is shown is what was judged |
| A settled guess shows `Voitit mallit +{n}` after the bonus line, and the models after the shares | Spec, UX |
| Nothing new on `Tulevat ottelut` | S6 |
| Tests: unit for the rules, the reader, settling's reward, the view, the page and the route; integration against Postgres for the reward and its once-only index; end to end in `guessing-game-models.spec.ts` | Spec, Tests Required |
