import { describe, expect, it } from "vitest";
import {
  favouredOutcome,
  GAME_MODELS,
  MODEL_REWARD,
  type ModelGuess,
  modelsBeaten,
} from "@/lib/guessing-game-models";

/**
 * Arvauspeli's rules against the models: which take part, a model's 1X2 at a
 * tie, and how many models a guess beat, of each kind.
 *
 * decisions/074-against-the-models.md
 */

const ELO = (outcome: ModelGuess["outcome"], model = "elo-v1"): ModelGuess => ({
  model,
  outcome,
  score: null,
});
const POISSON = (homeGoals: number, awayGoals: number): ModelGuess => ({
  model: "poisson-v1",
  outcome: homeGoals > awayGoals ? "1" : homeGoals < awayGoals ? "2" : "X",
  score: { homeGoals, awayGoals },
});

describe("the models", () => {
  it("are the four logged models, in the order they are shown, each worth 10", () => {
    expect(GAME_MODELS).toEqual(["elo-v1", "elo-form-v1", "elo-home-v1", "poisson-v1"]);
    expect(MODEL_REWARD).toBe(10);
  });
});

describe("favouredOutcome", () => {
  it("is the outcome with the highest probability", () => {
    expect(favouredOutcome({ home: 0.5, draw: 0.3, away: 0.2 })).toBe("1");
    expect(favouredOutcome({ home: 0.2, draw: 0.5, away: 0.3 })).toBe("X");
    expect(favouredOutcome({ home: 0.2, draw: 0.3, away: 0.5 })).toBe("2");
  });

  it("gives a tie to 1, then X", () => {
    expect(favouredOutcome({ home: 0.4, draw: 0.4, away: 0.2 })).toBe("1");
    expect(favouredOutcome({ home: 0.4, draw: 0.2, away: 0.4 })).toBe("1");
    expect(favouredOutcome({ home: 0.2, draw: 0.4, away: 0.4 })).toBe("X");
  });
});

describe("modelsBeaten, a 1X2 guess", () => {
  const AWAY_WIN = { homeGoals: 0, awayGoals: 2 };

  it("beats every model whose 1X2 was wrong when its own was right", () => {
    const models = [ELO("1"), ELO("X", "elo-form-v1"), ELO("2", "elo-home-v1"), POISSON(1, 1)];

    expect(modelsBeaten({ kind: "outcome", outcome: "2" }, AWAY_WIN, models)).toBe(3);
  });

  it("beats all four when every model was wrong, and none when all were right", () => {
    const wrong = [ELO("1"), ELO("1", "elo-form-v1"), ELO("X", "elo-home-v1"), POISSON(2, 0)];
    const right = [ELO("2"), ELO("2", "elo-form-v1"), ELO("2", "elo-home-v1"), POISSON(0, 1)];

    expect(modelsBeaten({ kind: "outcome", outcome: "2" }, AWAY_WIN, wrong)).toBe(4);
    expect(modelsBeaten({ kind: "outcome", outcome: "2" }, AWAY_WIN, right)).toBe(0);
  });

  it("beats nobody when its own 1X2 was wrong", () => {
    expect(modelsBeaten({ kind: "outcome", outcome: "1" }, AWAY_WIN, [ELO("X")])).toBe(0);
  });

  it("beats nobody with no models", () => {
    expect(modelsBeaten({ kind: "outcome", outcome: "2" }, AWAY_WIN, [])).toBe(0);
  });
});

describe("modelsBeaten, a score guess", () => {
  const RESULT = { homeGoals: 2, awayGoals: 1 };
  const ELOS = [ELO("2"), ELO("X", "elo-form-v1")];

  it("beats Poisson when its tier is higher, and never the Elo models, which have no score", () => {
    // Exact against Poisson's goal difference.
    expect(
      modelsBeaten({ kind: "score", homeGoals: 2, awayGoals: 1 }, RESULT, [...ELOS, POISSON(3, 2)])
    ).toBe(1);
    // Goal difference against Poisson's 1X2 only.
    expect(
      modelsBeaten({ kind: "score", homeGoals: 1, awayGoals: 0 }, RESULT, [POISSON(4, 1)])
    ).toBe(1);
    // 1X2 against Poisson's miss.
    expect(
      modelsBeaten({ kind: "score", homeGoals: 3, awayGoals: 0 }, RESULT, [POISSON(1, 1)])
    ).toBe(1);
  });

  it("does not beat Poisson on an equal or a lower tier", () => {
    expect(
      modelsBeaten({ kind: "score", homeGoals: 3, awayGoals: 2 }, RESULT, [POISSON(1, 0)])
    ).toBe(0);
    expect(
      modelsBeaten({ kind: "score", homeGoals: 3, awayGoals: 0 }, RESULT, [POISSON(2, 1)])
    ).toBe(0);
  });

  it("beats nobody when Poisson has no stored score", () => {
    expect(modelsBeaten({ kind: "score", homeGoals: 2, awayGoals: 1 }, RESULT, ELOS)).toBe(0);
  });
});
