/**
 * `Arvauspeli`'s rules for playing against the prediction models: which take
 * part, what a model's guess is, and how many a player's guess beat.
 *
 * decisions/074-against-the-models.md
 */

import { ELO_MODEL } from "./elo";
import { ELO_FORM_MODEL, ELO_HOME_MODEL } from "./elo-variants";
import { type Guess, judge, type Outcome, outcomeOf, type Tier } from "./guessing-game";
import { POISSON_MODEL } from "./poisson";

/**
 * The models a player's guess is compared with, in the order they are shown,
 * and what beating one pays.
 *
 * decisions/074-against-the-models.md
 */
export const GAME_MODELS = [ELO_MODEL, ELO_FORM_MODEL, ELO_HOME_MODEL, POISSON_MODEL] as const;
export const MODEL_REWARD = 10;

/**
 * A model's guess on a match: the 1X2 its last prediction before kickoff
 * favours, and for Poisson its most likely score.
 *
 * decisions/074-against-the-models.md
 */
export type ModelGuess = {
  model: string;
  outcome: Outcome;
  score: { homeGoals: number; awayGoals: number } | null;
};

/**
 * The outcome a prediction gives the highest probability; a tie goes to `1`,
 * then `X`.
 *
 * decisions/074-against-the-models.md
 */
export function favouredOutcome(probabilities: {
  home: number;
  draw: number;
  away: number;
}): Outcome {
  const { home, draw, away } = probabilities;
  if (home >= draw && home >= away) return "1";
  return draw >= away ? "X" : "2";
}

const TIER_RANK: Readonly<Record<Tier, number>> = { miss: 0, outcome: 1, difference: 2, exact: 3 };

/**
 * How many models a played guess beat: a 1X2 guess each model whose 1X2 was
 * wrong while its own was right; a score guess each model with a score, which
 * is Poisson, whose tier its own tier exceeds.
 *
 * decisions/074-against-the-models.md
 */
export function modelsBeaten(
  guess: Guess,
  result: { homeGoals: number; awayGoals: number },
  models: readonly ModelGuess[]
): number {
  const { homeGoals, awayGoals } = result;
  if (guess.kind === "outcome") {
    const actual = outcomeOf(homeGoals, awayGoals);
    if (guess.outcome !== actual) return 0;
    return models.filter((model) => model.outcome !== actual).length;
  }
  const own = TIER_RANK[judge(guess, homeGoals, awayGoals).tier];
  return models.filter(
    (model) =>
      model.score !== null &&
      own > TIER_RANK[judge({ kind: "score", ...model.score }, homeGoals, awayGoals).tier]
  ).length;
}
