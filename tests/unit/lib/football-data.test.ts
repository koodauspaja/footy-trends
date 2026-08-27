import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPETITION_CACHE_TTL_SECONDS,
  getSeasonContext,
  getSeasonMatches,
  MATCHES_CACHE_TTL_SECONDS,
  normalizeMatch,
  seasonSpansCalendarYears,
  selectActiveSeason,
  selectUpcomingSeason,
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
      2026,
      "PL"
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

  it("stamps the match with whichever competition code it was requested for", () => {
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
      2026,
      "BL1"
    );

    expect(result).toMatchObject({ competitionCode: "BL1" });
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
      2026,
      "PL"
    );

    expect(result).toMatchObject({
      providerMatchId: 456,
      status: "SCHEDULED",
      homeGoals: null,
      awayGoals: null,
    });
  });

  it("rejects matches missing required fields, regardless of status", () => {
    expect(normalizeMatch({ status: "FINISHED" }, 2026, "PL")).toBeNull();
    expect(normalizeMatch({ id: 1 }, 2026, "PL")).toBeNull();
    expect(normalizeMatch({ id: 1, status: "FINISHED" }, 2026, "PL")).toBeNull();
    expect(
      normalizeMatch({ id: 1, status: "FINISHED", utcDate: "2026-08-15T14:00:00Z" }, 2026, "PL")
    ).toBeNull();
    expect(
      normalizeMatch(
        {
          id: 1,
          status: "FINISHED",
          utcDate: "2026-08-15T14:00:00Z",
          homeTeam: { id: 57, name: "Arsenal FC" },
        },
        2026,
        "PL"
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

  it("selects the currentSeason as upcoming when its startDate is in the future", () => {
    const season = selectUpcomingSeason(
      { currentSeason: { id: 2500, startDate: "2026-08-15" } },
      new Date("2026-08-08")
    );

    expect(season?.id).toBe(2500);
  });

  it("selects a future season listed only in seasons[]", () => {
    const season = selectUpcomingSeason(
      {
        currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" },
        seasons: [{ id: 2500, startDate: "2026-08-15" }],
      },
      new Date("2026-08-08")
    );

    expect(season?.id).toBe(2500);
  });

  it("picks the nearest future season when more than one is listed", () => {
    const season = selectUpcomingSeason(
      {
        seasons: [
          { id: 2600, startDate: "2027-08-14" },
          { id: 2500, startDate: "2026-08-15" },
        ],
      },
      new Date("2026-08-08")
    );

    expect(season?.id).toBe(2500);
  });

  it("finds no upcoming season when nothing is future-dated", () => {
    const season = selectUpcomingSeason(
      { currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" } },
      new Date("2026-08-08")
    );

    expect(season).toBeUndefined();
  });

  it("never treats an undated season as upcoming", () => {
    const season = selectUpcomingSeason(
      {
        currentSeason: { id: 2403, startDate: "2025-08-15" },
        seasons: [{ id: 2500 }],
      },
      new Date("2026-08-08")
    );

    expect(season).toBeUndefined();
  });

  it("resolves the season identifier as the start year, not the provider season id", async () => {
    getCachedMock.mockResolvedValue({
      currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" },
    });

    const { activeSeasonId } = await getSeasonContext("PL");

    expect(activeSeasonId).toBe(2025);
    expect(getCachedMock).toHaveBeenCalledWith(
      expect.any(String),
      COMPETITION_CACHE_TTL_SECONDS,
      expect.any(Function)
    );
  });

  it("caches each competition's context under its own key", async () => {
    getCachedMock.mockResolvedValue({
      currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" },
    });

    await getSeasonContext("BL1");

    expect(getCachedMock.mock.calls[0]?.[0]).toBe("football-data:competition:BL1:v2");
  });

  it("bounds the selectable seasons by the configured floor", async () => {
    vi.stubEnv("FOOTBALL_DATA_EARLIEST_SEASON", "2023");
    getCachedMock.mockResolvedValue({
      currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" },
    });

    const { selectableSeasons } = await getSeasonContext("PL");

    expect(selectableSeasons).toEqual([
      { seasonId: 2025, label: "2025/26" },
      { seasonId: 2024, label: "2024/25" },
      { seasonId: 2023, label: "2023/24" },
    ]);
  });

  it("includes an already-published upcoming season ahead of the active one", async () => {
    getCachedMock.mockResolvedValue({
      currentSeason: { id: 2403, startDate: "2025-08-15", endDate: "2026-05-24" },
      seasons: [{ id: 2600, startDate: "2099-08-15" }],
    });

    const { activeSeasonId, selectableSeasons } = await getSeasonContext("PL");

    expect(activeSeasonId).toBe(2025);
    expect(selectableSeasons[0]).toEqual({ seasonId: 2099, label: "2099/00" });
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

    const { selectableSeasons } = await getSeasonContext("PL");

    expect(selectableSeasons.map((season) => season.seasonId)).toEqual([2025, 2024]);
  });

  it("rejects when the provider has no resolvable season", async () => {
    getCachedMock.mockResolvedValue({});

    await expect(getSeasonContext("PL")).rejects.toThrow(
      "Football data response has no current season"
    );
  });

  it("treats a response with no matches field as no matches", async () => {
    getCachedMock.mockResolvedValue({});

    await expect(getSeasonMatches("PL", 2025)).resolves.toEqual([]);
  });

  it("caches each season's matches under its own key, scoped by competition", async () => {
    getCachedMock.mockResolvedValue({ matches: [] });

    await getSeasonMatches("PL", 2024);
    await getSeasonMatches("PL", 2023);
    await getSeasonMatches("BL1", 2024);

    expect(getCachedMock.mock.calls.map(([key]) => key)).toEqual([
      "football-data:matches:PL:2024",
      "football-data:matches:PL:2023",
      "football-data:matches:BL1:2024",
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

    const result = await getSeasonMatches("PL", 2025);

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
        stage: null,
        groupName: null,
        regularTimeHome: null,
        regularTimeAway: null,
        extraTimeHome: null,
        extraTimeAway: null,
        penaltiesHome: null,
        penaltiesAway: null,
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
        stage: null,
        groupName: null,
        regularTimeHome: null,
        regularTimeAway: null,
        extraTimeHome: null,
        extraTimeAway: null,
        penaltiesHome: null,
        penaltiesAway: null,
      },
    ]);
  });

  it("carries a cup match's stage, group and score breakdown", () => {
    const result = normalizeMatch(
      {
        id: 999,
        utcDate: "2025-03-11T20:00:00Z",
        status: "FINISHED",
        matchday: 2,
        stage: "LAST_16",
        group: null,
        homeTeam: { id: 64, name: "Liverpool FC" },
        awayTeam: { id: 524, name: "Paris Saint-Germain FC" },
        score: {
          fullTime: { home: 1, away: 5 },
          regularTime: { home: 0, away: 1 },
          extraTime: { home: 0, away: 0 },
          penalties: { home: 1, away: 4 },
        },
      },
      2024,
      "CL"
    );

    expect(result).toMatchObject({
      stage: "LAST_16",
      groupName: null,
      regularTimeHome: 0,
      regularTimeAway: 1,
      extraTimeHome: 0,
      extraTimeAway: 0,
      penaltiesHome: 1,
      penaltiesAway: 4,
    });
    // `homeGoals`/`awayGoals` stay the provider's shootout-inflated `fullTime`
    // deliberately: changing them would move every league's standings. The
    // bracket reads the breakdown above instead.
    expect(result).toMatchObject({ homeGoals: 1, awayGoals: 5 });
  });

  it("maps a group-stage match's group", () => {
    const result = normalizeMatch(
      {
        id: 1000,
        utcDate: "2023-09-19T19:00:00Z",
        status: "FINISHED",
        matchday: 1,
        stage: "GROUP_STAGE",
        group: "GROUP_A",
        homeTeam: { id: 1, name: "A" },
        awayTeam: { id: 2, name: "B" },
        score: { fullTime: { home: 1, away: 0 } },
      },
      2023,
      "CL"
    );

    expect(result).toMatchObject({ stage: "GROUP_STAGE", groupName: "GROUP_A" });
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

    await getSeasonContext("PL");

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

    await expect(getSeasonContext("PL")).rejects.toThrow("FOOTBALL_DATA_API_KEY is not configured");
  });

  it("logs and throws when the provider request fails", async () => {
    vi.stubEnv("FOOTBALL_DATA_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    await expect(getSeasonContext("PL")).rejects.toThrow("Football data request failed: 500");
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

    await expect(getSeasonContext("PL")).rejects.toThrow("network unreachable");
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

    await getSeasonMatches("PL", 2025);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.football-data.org/v4/competitions/PL/matches?season=2025",
      { headers: { "X-Auth-Token": "test-api-key" } }
    );
  });

  it("requests a non-PL competition's matches from its own path", async () => {
    vi.stubEnv("FOOTBALL_DATA_API_KEY", "test-api-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    await getSeasonMatches("BL1", 2025);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.football-data.org/v4/competitions/BL1/matches?season=2025",
      { headers: { "X-Auth-Token": "test-api-key" } }
    );
  });
});

describe("seasonSpansCalendarYears", () => {
  it("is false for a tournament played inside one calendar year", () => {
    expect(
      seasonSpansCalendarYears({ id: 2026, startDate: "2026-06-11", endDate: "2026-07-19" })
    ).toBe(false);
  });

  it("is true for a league season crossing the new year", () => {
    expect(
      seasonSpansCalendarYears({ id: 2024, startDate: "2024-08-16", endDate: "2025-05-25" })
    ).toBe(true);
  });

  it("treats a season with no end date as spanning, which is what leagues do", () => {
    expect(seasonSpansCalendarYears({ id: 2025, startDate: "2025-08-15" })).toBe(true);
  });

  it("treats a season with no start date as spanning", () => {
    expect(seasonSpansCalendarYears({ id: 2025, endDate: "2026-05-24" })).toBe(true);
  });

  it("treats a missing season as spanning", () => {
    expect(seasonSpansCalendarYears(undefined)).toBe(true);
  });
});
