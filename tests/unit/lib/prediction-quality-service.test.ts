import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The service's decisions around its query: the outcome from the scores, the
 * models judged, the cache key and lifetime, and failure as its own case. The
 * join itself is proved against Postgres in
 * `tests/integration/prediction-quality.test.ts`.
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

describe("getPredictionQuality (specs/054)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReset();
    mocks.getCached
      .mockReset()
      .mockImplementation(async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
        fetcher()
      );
  });

  it("judges the baseline and Elo, from 2016 domestically and 2023 for football-data (S2, S4)", () => {
    expect(QUALITY_MODELS).toEqual(["home-baseline-v1", "elo-v1"]);
    expect(QUALITY_FIRST_SEASON).toEqual({ taso: 2016, "football-data": 2023 });
  });

  it("caches each provider and kind apart for 15 minutes (S11)", async () => {
    mocks.select.mockResolvedValue([]);

    await getPredictionQuality("taso", "backtest");
    await getPredictionQuality("football-data", "live");

    expect(mocks.getCached.mock.calls.map(([key, ttl]) => [key, ttl])).toEqual([
      ["quality:v1:taso:backtest", 900],
      ["quality:v1:football-data:live", 900],
    ]);
  });

  it("reads each outcome from the score, and judges the matches both models predicted", async () => {
    mocks.select.mockResolvedValue([
      row("home-baseline-v1", 1, 2, 0),
      row("elo-v1", 1, 2, 0),
      row("home-baseline-v1", 2, 1, 1),
      row("elo-v1", 2, 1, 1),
      row("home-baseline-v1", 3, 0, 1),
      row("elo-v1", 3, 0, 1),
      // Only one model predicted it: not judged (S4).
      row("home-baseline-v1", 4, 3, 0),
    ]);

    const result = await getPredictionQuality("football-data", "backtest");

    expect(result).toMatchObject({ status: "ok", matches: 3 });
    // Every prediction picks home: right once in three.
    if (result.status !== "ok") return;
    expect(result.totals[0]?.accuracy).toBeCloseTo(100 / 3, 12);
  });

  it("drops a TASO row whose score is missing", async () => {
    mocks.select.mockResolvedValue([row("home-baseline-v1", 1, 1, 0), row("elo-v1", 1, null, 0)]);

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
