import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentSeasonId, normalizeMatch, selectActiveSeason } from "@/lib/football-data";

const { getCachedMock } = vi.hoisted(() => ({ getCachedMock: vi.fn() }));
vi.mock("@/lib/cache", () => ({ getCached: getCachedMock }));

describe("football-data mapping", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    getCachedMock.mockReset();
  });

  it("maps a finished provider match", () => {
    const result = normalizeMatch(
      {
        id: 123,
        utcDate: "2026-08-15T14:00:00Z",
        status: "FINISHED",
        matchday: 1,
        homeTeam: { id: 57, name: "Arsenal FC" },
        awayTeam: { id: 61, name: "Chelsea FC" },
        score: { fullTime: { home: 2, away: 1 } },
      },
      2026
    );

    expect(result).toMatchObject({
      providerMatchId: 123,
      competitionCode: "PL",
      seasonId: 2026,
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it("ignores unfinished and incomplete matches", () => {
    expect(normalizeMatch({ id: 1, status: "POSTPONED" }, 2026)).toBeNull();
    expect(
      normalizeMatch(
        { id: 2, status: "FINISHED", score: { fullTime: { home: null, away: 1 } } },
        2026
      )
    ).toBeNull();
  });

  it("selects the previous season before the current season starts", () => {
    const season = selectActiveSeason(
      {
        currentSeason: { id: 2026, startDate: "2026-08-15" },
        seasons: [{ id: 2025, startDate: "2025-08-15", endDate: "2026-05-24" }],
      },
      new Date("2026-08-08")
    );

    expect(season?.id).toBe(2025);
  });

  it("resolves the season identifier as the start year, not the provider season id", async () => {
    getCachedMock.mockResolvedValue({
      currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" },
    });

    const seasonId = await getCurrentSeasonId();

    expect(seasonId).toBe(2025);
  });
});
