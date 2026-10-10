import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinishedMatch } from "@/lib/prediction-backtest";

/**
 * The Poisson service: the fit it makes, what it caches, and failure as its
 * own case.
 *
 * decisions/055-poisson-goal-model.md
 */

const mocks = vi.hoisted(() => ({
  readFinished: vi.fn<(sources?: ReadonlySet<string>) => Promise<FinishedMatch[]>>(),
  getCached: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/prediction-log-service", () => ({ readFinished: mocks.readFinished }));
vi.mock("@/lib/cache", () => ({ getCached: mocks.getCached }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));

import { fitPoisson, predictPoisson, utcDay } from "@/lib/poisson";
import { getPoissonFit } from "@/lib/poisson-service";

const NOW = new Date("2025-06-01T12:00:00Z");

function played(day: number, hour: number, homeTeam: number, awayTeam: number, home: number) {
  return {
    source: "taso" as const,
    code: "VL",
    seasonId: 2025,
    providerMatchId: day * 100 + hour,
    kickoffAt: new Date(Date.UTC(2025, 4, day, hour)),
    homeTeam,
    awayTeam,
    homeGoals: home,
    awayGoals: 1,
  };
}

// 31 May is a 32nd of May to `Date.UTC`: 1 June, the day asked for.
const history = [played(20, 15, 11, 22, 3), played(25, 15, 22, 11, 1), played(32, 9, 11, 22, 9)];

// What the cache returns: the fetcher's value as it would come back out of
// Redis.
async function throughJson(_key: string, _ttl: number, fetcher: () => Promise<unknown>) {
  return JSON.parse(JSON.stringify(await fetcher()));
}

describe("the Poisson service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCached.mockReset().mockImplementation(throughJson);
    mocks.readFinished.mockReset().mockResolvedValue(history);
  });

  it("caches one fit per provider, for 15 minutes, reading only that provider", async () => {
    await getPoissonFit("taso", () => NOW);
    await getPoissonFit("football-data", () => NOW);

    expect(mocks.getCached.mock.calls.map(([key, ttl]) => [key, ttl])).toEqual([
      ["poisson:v1:taso", 900],
      ["poisson:v1:football-data", 900],
    ]);
    expect(mocks.readFinished.mock.calls).toEqual([
      [new Set(["taso"])],
      [new Set(["football-data"])],
    ]);
  });

  it("gives today's fit, through the cache's JSON: this morning's match is not in it", async () => {
    const result = await getPoissonFit("taso", () => NOW);

    const expected = fitPoisson(history.slice(0, 2), utcDay(NOW));
    expect(result).toEqual({ status: "ok", fit: expected });
    if (result.status !== "ok") return;
    // Maps again, so a prediction can be read off it.
    expect(predictPoisson(result.fit, "VL", 11, 22)).toEqual(
      predictPoisson(expected, "VL", 11, 22)
    );
    expect(result.fit.attack.get(11)).toBeGreaterThan(result.fit.attack.get(22) as number);
  });

  it("asks the real clock for today when given none", async () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const result = await getPoissonFit("taso");

      expect(result).toEqual({
        status: "ok",
        fit: fitPoisson(history.slice(0, 2), utcDay(NOW)),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails as its own case, and says so in the log with the provider", async () => {
    mocks.readFinished.mockRejectedValue(new Error("connection reset"));

    await expect(getPoissonFit("taso", () => NOW)).resolves.toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: new Error("connection reset"), source: "taso" },
      "Unable to fit the Poisson model"
    );
  });
});
