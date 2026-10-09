import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The service's decisions around its query: the outcome from the scores, the models
 * judged, the cache key and lifetime, and failure as its own case. The join itself
 * is proved against Postgres in `tests/integration/prediction-quality.test.ts`.
 *
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 */

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getCached: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: () => Promise.resolve().then(mocks.select) }) }),
    }),
  },
}));
vi.mock("@/lib/cache", () => ({ getCached: mocks.getCached }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));
vi.mock("@/lib/match-service", () => ({
  FOOTBALL_DATA_HOME_GOALS: "home",
  FOOTBALL_DATA_AWAY_GOALS: "away",
}));

import {
  getPredictionQuality,
  QUALITY_FIRST_SEASON,
  QUALITY_MODELS,
  qualityCacheKey,
} from "@/lib/prediction-quality-service";

function row(
  model: string,
  providerMatchId: number,
  homeGoals: number | null,
  awayGoals: number | null
) {
  return {
    model,
    providerMatchId,
    seasonId: 2024,
    kickoffAt: new Date(Date.UTC(2024, 4, providerMatchId)),
    home: 0.5,
    draw: 0.3,
    away: 0.2,
    homeGoals,
    awayGoals,
  };
}

describe("getPredictionQuality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReset();
    mocks.getCached
      .mockReset()
      .mockImplementation(async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
        fetcher()
      );
  });

  it("judges the baseline, Elo and Poisson, from 2016 domestically and 2023 for football-data", () => {
    expect(QUALITY_MODELS).toEqual(["home-baseline-v1", "elo-v1", "poisson-v1"]);
    expect(QUALITY_FIRST_SEASON).toEqual({ taso: 2016, "football-data": 2023 });
  });

  it("names the cache key the backtest drops", () => {
    expect(qualityCacheKey("taso", "backtest")).toBe("quality:v2:taso:backtest");
  });

  it("caches each provider and kind apart for 15 minutes", async () => {
    mocks.select.mockResolvedValue([]);

    await getPredictionQuality("taso", "backtest");
    await getPredictionQuality("football-data", "live");

    expect(mocks.getCached.mock.calls.map(([key, ttl]) => [key, ttl])).toEqual([
      ["quality:v2:taso:backtest", 900],
      ["quality:v2:football-data:live", 900],
    ]);
  });

  it("reads each outcome from the score, and judges the matches all three models predicted", async () => {
    const byAll = (providerMatchId: number, homeGoals: number, awayGoals: number) =>
      QUALITY_MODELS.map((model) => row(model, providerMatchId, homeGoals, awayGoals));
    mocks.select.mockResolvedValue([
      ...byAll(1, 2, 0),
      ...byAll(2, 1, 1),
      ...byAll(3, 0, 1),
      // Only one model predicted it: not judged.
      row("home-baseline-v1", 4, 3, 0),
      // Poisson did not, on the competition's first day: not judged under any.
      row("home-baseline-v1", 5, 3, 0),
      row("elo-v1", 5, 3, 0),
    ]);

    const result = await getPredictionQuality("football-data", "backtest");

    expect(result).toMatchObject({ status: "ok", matches: 3 });
    // Every prediction picks home: right once in three.
    if (result.status !== "ok") return;
    expect(result.totals[0]?.accuracy).toBeCloseTo(100 / 3, 12);
    expect(result.totals.map((total) => [total.model, total.matches])).toEqual([
      ["home-baseline-v1", 3],
      ["elo-v1", 3],
      ["poisson-v1", 3],
    ]);
  });

  it("drops a TASO row whose score is missing", async () => {
    mocks.select.mockResolvedValue([
      row("home-baseline-v1", 1, 1, 0),
      row("elo-v1", 1, null, 0),
      row("poisson-v1", 1, 1, 0),
    ]);

    await expect(getPredictionQuality("taso", "backtest")).resolves.toEqual({ status: "empty" });
  });

  it("fails as its own case, and says so in the log", async () => {
    mocks.getCached.mockRejectedValue(new Error("connection reset"));

    await expect(getPredictionQuality("taso", "live")).resolves.toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), source: "taso", kind: "live" }),
      "Unable to read the prediction quality"
    );
  });
});
