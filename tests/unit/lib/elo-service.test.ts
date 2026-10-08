import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinishedMatch } from "@/lib/prediction-backtest";

/**
 * The Elo service: the replay it runs, what it caches, and what it returns for
 * a team and for a match.
 *
 * decisions/053-elo-ratings.md
 */

const mocks = vi.hoisted(() => ({
  readFinished: vi.fn<(sources?: ReadonlySet<string>) => Promise<FinishedMatch[]>>(),
  getCached: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/prediction-log-service", () => ({ readFinished: mocks.readFinished }));
vi.mock("@/lib/cache", () => ({ getCached: mocks.getCached }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));

import { expectedHome, replayElo } from "@/lib/elo";
import { getEloRatings, getTeamElo } from "@/lib/elo-service";

function played(day: number, homeTeam: number, awayTeam: number, home: number, away: number) {
  return {
    source: "taso" as const,
    code: "VL",
    seasonId: 2025,
    providerMatchId: day,
    kickoffAt: new Date(Date.UTC(2025, 4, day, 15)),
    homeTeam,
    awayTeam,
    homeGoals: home,
    awayGoals: away,
  };
}

// What the cache returns: the fetcher's value as it would come back out of
// Redis.
async function throughJson(_key: string, _ttl: number, fetcher: () => Promise<unknown>) {
  return JSON.parse(JSON.stringify(await fetcher()));
}

describe("the Elo service (specs/053 S11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCached.mockReset().mockImplementation(throughJson);
    mocks.readFinished
      .mockReset()
      .mockResolvedValue([played(1, 11, 22, 2, 0), played(2, 22, 11, 1, 1)]);
  });

  it("caches one replay per provider, for 15 minutes, reading only that provider", async () => {
    await getEloRatings("taso");

    expect(mocks.getCached).toHaveBeenCalledWith("elo:v1:taso", 900, expect.any(Function));
    expect(mocks.readFinished).toHaveBeenCalledWith(new Set(["taso"]));
  });

  it("gives every team's current rating, through the cache's JSON", async () => {
    const result = await getEloRatings("taso");
    const replayed = replayElo(await mocks.readFinished());

    expect(result).toEqual({ status: "ok", ratings: replayed.ratings });
  });

  it("gives a team's rating after each match, to one decimal", async () => {
    const result = await getTeamElo("taso", 11);
    const afterFirst = Math.round((1500 + 20 * (1 - expectedHome(1500, 1500))) * 10) / 10;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") return;
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toEqual({ seasonId: 2025, rating: afterFirst });
  });

  it("is empty for a team that played none of the covered competitions", async () => {
    await expect(getTeamElo("taso", 99)).resolves.toEqual({ status: "empty" });
  });

  it("fails as its own case, and says so in the log", async () => {
    mocks.getCached.mockRejectedValue(new Error("connection reset"));

    await expect(getEloRatings("football-data")).resolves.toEqual({ status: "error" });
    await expect(getTeamElo("football-data", 57)).resolves.toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), source: "football-data" }),
      "Unable to read the Elo ratings"
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ team: 57 }),
      "Unable to read the team's Elo history"
    );
  });
});
