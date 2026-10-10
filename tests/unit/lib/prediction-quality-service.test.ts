import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The service's decisions around its query: the outcome from the scores, the models
 * judged, the cache key and lifetime, and failure as its own case. The join itself
 * is proved against Postgres in `tests/integration/prediction-quality.test.ts`.
 *
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 * decisions/056-accuracy-by-competition.md
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
  qualityCacheKeys,
  qualityCompetitions,
} from "@/lib/prediction-quality-service";

function row(
  model: string,
  providerMatchId: number,
  homeGoals: number | null,
  awayGoals: number | null,
  competitionCode = "PL"
) {
  return {
    model,
    providerMatchId,
    competitionCode,
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

  it("lists a provider's compared competitions in its picker's order", () => {
    expect(qualityCompetitions("taso")).toEqual([
      "VL",
      "M1L",
      "M1",
      "M2",
      "NL",
      "N1",
      "P21SM",
      "P211",
      "P18SM",
      "T18SM",
    ]);
    expect(qualityCompetitions("football-data")).toEqual([
      "PL",
      "ELC",
      "FL1",
      "BL1",
      "SA",
      "DED",
      "PPL",
      "PD",
      "BSA",
      "CL",
    ]);
  });

  it("names the cache key of every competition, and of one", () => {
    expect(qualityCacheKey("taso", "backtest")).toBe("quality:v3:taso:backtest");
    expect(qualityCacheKey("taso", "backtest", "VL")).toBe("quality:v3:taso:backtest:VL");
  });

  it("names every key the backtest drops: the provider's own and one per competition", () => {
    expect(qualityCacheKeys("football-data", "backtest")).toEqual([
      "quality:v3:football-data:backtest",
      ...["PL", "ELC", "FL1", "BL1", "SA", "DED", "PPL", "PD", "BSA", "CL"].map(
        (code) => `quality:v3:football-data:backtest:${code}`
      ),
    ]);
  });

  it("caches each provider, kind and competition apart for 15 minutes", async () => {
    mocks.select.mockResolvedValue([]);

    await getPredictionQuality("taso", "backtest", null);
    await getPredictionQuality("football-data", "live", null);
    await getPredictionQuality("football-data", "live", "PL");

    expect(mocks.getCached.mock.calls.map(([key, ttl]) => [key, ttl])).toEqual([
      ["quality:v3:taso:backtest", 900],
      ["quality:v3:football-data:live", 900],
      ["quality:v3:football-data:live:PL", 900],
    ]);
  });

  it("counts one competition's matches when given it, the rows per competition still whole", async () => {
    const byAll = (providerMatchId: number, code: string) =>
      QUALITY_MODELS.map((model) => row(model, providerMatchId, 2, 0, code));
    mocks.select.mockResolvedValue([...byAll(1, "ELC"), ...byAll(2, "PL"), ...byAll(3, "PL")]);

    const result = await getPredictionQuality("football-data", "backtest", "ELC");

    expect(result).toMatchObject({
      status: "ok",
      matches: 1,
      // The picker's order, not the rows'.
      competitions: [
        { code: "PL", matches: 2 },
        { code: "ELC", matches: 1 },
      ],
    });
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

    const result = await getPredictionQuality("football-data", "backtest", null);

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

    await expect(getPredictionQuality("taso", "backtest", null)).resolves.toEqual({
      status: "empty",
    });
  });

  it("fails as its own case, and says so in the log", async () => {
    mocks.getCached.mockRejectedValue(new Error("connection reset"));

    await expect(getPredictionQuality("taso", "live", null)).resolves.toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error), source: "taso", kind: "live" },
      "Unable to read the prediction quality"
    );
    expect(Object.keys(mocks.loggerError.mock.calls[0]?.[0])).not.toContain("competition");
  });

  it("names the competition in the log when one competition's read fails", async () => {
    mocks.getCached.mockRejectedValue(new Error("connection reset"));

    await expect(getPredictionQuality("taso", "live", "VL")).resolves.toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error), source: "taso", kind: "live", competition: "VL" },
      "Unable to read the prediction quality"
    );
  });
});
