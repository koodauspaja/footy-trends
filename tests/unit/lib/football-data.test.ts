import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPETITION_CACHE_TTL_SECONDS,
  getSeasonContext,
  getSeasonMatches,
  MATCHES_CACHE_TTL_SECONDS,
  normalizeMatch,
  selectActiveSeason,
} from "@/lib/football-data";

const { getCachedMock, loggerInfoMock, loggerErrorMock } = vi.hoisted(() => ({
  getCachedMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({ getCached: getCachedMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: loggerInfoMock, error: loggerErrorMock } }));

describe("football-data mapping", () => {
  const originalApiKey = process.env.FOOTBALL_DATA_API_KEY;

  beforeEach(() => {
    vi.unstubAllEnvs();
    getCachedMock.mockReset();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env.FOOTBALL_DATA_API_KEY = originalApiKey;
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
      status: "FINISHED",
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it("maps a not-yet-played match to null goals instead of rejecting it", () => {
    const result = normalizeMatch(
      {
        id: 456,
        utcDate: "2026-08-22T14:00:00Z",
        status: "SCHEDULED",
        matchday: 2,
        homeTeam: { id: 57, name: "Arsenal FC" },
        awayTeam: { id: 61, name: "Chelsea FC" },
      },
      2026
    );

    expect(result).toMatchObject({
      providerMatchId: 456,
      status: "SCHEDULED",
      homeGoals: null,
      awayGoals: null,
    });
  });

  it("rejects matches missing required fields, regardless of status", () => {
    expect(normalizeMatch({ status: "FINISHED" }, 2026)).toBeNull();
    expect(normalizeMatch({ id: 1 }, 2026)).toBeNull();
    expect(normalizeMatch({ id: 1, status: "FINISHED" }, 2026)).toBeNull();
    expect(
      normalizeMatch({ id: 1, status: "FINISHED", utcDate: "2026-08-15T14:00:00Z" }, 2026)
    ).toBeNull();
    expect(
      normalizeMatch(
        {
          id: 1,
          status: "FINISHED",
          utcDate: "2026-08-15T14:00:00Z",
          homeTeam: { id: 57, name: "Arsenal FC" },
        },
        2026
      )
    ).toBeNull();
  });

  it("treats a season with no start date as already started, ranked behind a dated season", () => {
    const season = selectActiveSeason(
      {
        currentSeason: { id: 2026 },
        seasons: [{ id: 2025, startDate: "2025-08-15", endDate: "2026-05-24" }],
      },
      new Date("2026-08-08")
    );

    expect(season?.id).toBe(2025);
  });

  it("ranks a dated season ahead of an undated one regardless of input order", () => {
    const season = selectActiveSeason(
      {
        currentSeason: { id: 2025, startDate: "2025-08-15" },
        seasons: [{ id: 2026 }],
      },
      new Date("2026-08-08")
    );

    expect(season?.id).toBe(2025);
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

    const { activeSeasonId } = await getSeasonContext();

    expect(activeSeasonId).toBe(2025);
    expect(getCachedMock).toHaveBeenCalledWith(
      expect.any(String),
      COMPETITION_CACHE_TTL_SECONDS,
      expect.any(Function)
    );
  });

  it("bounds the selectable seasons by the configured floor", async () => {
    vi.stubEnv("FOOTBALL_DATA_EARLIEST_SEASON", "2023");
    getCachedMock.mockResolvedValue({
      currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" },
    });

    const { selectableSeasons } = await getSeasonContext();

    expect(selectableSeasons).toEqual([
      { seasonId: 2025, label: "2025/26" },
      { seasonId: 2024, label: "2024/25" },
      { seasonId: 2023, label: "2023/24" },
    ]);
  });

  it("ignores the provider's unreachable historical seasons when listing selectable ones", async () => {
    vi.stubEnv("FOOTBALL_DATA_EARLIEST_SEASON", "2024");
    getCachedMock.mockResolvedValue({
      currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" },
      seasons: [
        { id: 2403, startDate: "2025-08-15" },
        { id: 1, startDate: "1888-09-08" },
      ],
    });

    const { selectableSeasons } = await getSeasonContext();

    expect(selectableSeasons.map((season) => season.seasonId)).toEqual([2025, 2024]);
  });

  it("rejects when the provider has no resolvable season", async () => {
    getCachedMock.mockResolvedValue({});

    await expect(getSeasonContext()).rejects.toThrow(
      "Football data response has no current season"
    );
  });

  it("treats a response with no matches field as no matches", async () => {
    getCachedMock.mockResolvedValue({});

    await expect(getSeasonMatches(2025)).resolves.toEqual([]);
  });

  it("caches each season's matches under its own key", async () => {
    getCachedMock.mockResolvedValue({ matches: [] });

    await getSeasonMatches(2024);
    await getSeasonMatches(2023);

    expect(getCachedMock.mock.calls.map(([key]) => key)).toEqual([
      "football-data:matches:PL:2024",
      "football-data:matches:PL:2023",
    ]);
  });

  it("normalizes every returned match regardless of status, and drops incomplete ones", async () => {
    getCachedMock.mockResolvedValue({
      matches: [
        {
          id: 1,
          utcDate: "2025-08-15T14:00:00Z",
          status: "FINISHED",
          homeTeam: { id: 57, name: "Arsenal FC" },
          awayTeam: { id: 61, name: "Chelsea FC" },
          score: { fullTime: { home: 2, away: 1 } },
        },
        {
          id: 2,
          utcDate: "2025-08-22T14:00:00Z",
          status: "SCHEDULED",
          homeTeam: { id: 61, name: "Chelsea FC" },
          awayTeam: { id: 57, name: "Arsenal FC" },
        },
        { id: 3, status: "POSTPONED" },
      ],
    });

    const result = await getSeasonMatches(2025);

    expect(getCachedMock).toHaveBeenCalledWith(
      expect.any(String),
      MATCHES_CACHE_TTL_SECONDS,
      expect.any(Function)
    );
    expect(result).toEqual([
      {
        providerMatchId: 1,
        competitionCode: "PL",
        seasonId: 2025,
        status: "FINISHED",
        kickoffAt: new Date("2025-08-15T14:00:00Z"),
        matchday: null,
        homeTeamProviderId: 57,
        homeTeamName: "Arsenal FC",
        awayTeamProviderId: 61,
        awayTeamName: "Chelsea FC",
        homeGoals: 2,
        awayGoals: 1,
      },
      {
        providerMatchId: 2,
        competitionCode: "PL",
        seasonId: 2025,
        status: "SCHEDULED",
        kickoffAt: new Date("2025-08-22T14:00:00Z"),
        matchday: null,
        homeTeamProviderId: 61,
        homeTeamName: "Chelsea FC",
        awayTeamProviderId: 57,
        awayTeamName: "Arsenal FC",
        homeGoals: null,
        awayGoals: null,
      },
    ]);
  });

  it("requests the provider with the configured API key and base URL, and logs the call", async () => {
    vi.stubEnv("FOOTBALL_DATA_API_KEY", "test-api-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ currentSeason: { id: 1, startDate: "2025-08-15" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    await getSeasonContext();

    expect(fetchMock).toHaveBeenCalledWith("https://api.football-data.org/v4/competitions/PL", {
      headers: { "X-Auth-Token": "test-api-key" },
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { method: "GET", path: "/competitions/PL", status: 200, durationMs: expect.any(Number) },
      "Football data request completed"
    );
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("throws when the API key is not configured", async () => {
    process.env.FOOTBALL_DATA_API_KEY = "";
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    await expect(getSeasonContext()).rejects.toThrow("FOOTBALL_DATA_API_KEY is not configured");
  });

  it("logs and throws when the provider request fails", async () => {
    vi.stubEnv("FOOTBALL_DATA_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    await expect(getSeasonContext()).rejects.toThrow("Football data request failed: 500");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { method: "GET", path: "/competitions/PL", status: 500, durationMs: expect.any(Number) },
      "Football data request failed"
    );
    expect(loggerInfoMock).not.toHaveBeenCalled();
  });

  it("logs and rethrows when the fetch itself rejects", async () => {
    vi.stubEnv("FOOTBALL_DATA_API_KEY", "test-api-key");
    const networkError = new Error("network unreachable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    await expect(getSeasonContext()).rejects.toThrow("network unreachable");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      {
        err: networkError,
        method: "GET",
        path: "/competitions/PL",
        durationMs: expect.any(Number),
      },
      "Football data request failed"
    );
    expect(loggerInfoMock).not.toHaveBeenCalled();
  });

  it("requests the season's matches without a status filter, so upcoming fixtures are included too", async () => {
    vi.stubEnv("FOOTBALL_DATA_API_KEY", "test-api-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    await getSeasonMatches(2025);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.football-data.org/v4/competitions/PL/matches?season=2025",
      { headers: { "X-Auth-Token": "test-api-key" } }
    );
  });
});
