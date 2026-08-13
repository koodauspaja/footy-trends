import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedProviderMatch } from "@/lib/football-data";
import {
  getMaxMatchday,
  getPremierLeagueStandings,
  getRoundMatches,
  getTeamMatches,
  synchronizeMatches,
} from "@/lib/standings-service";

const {
  dbMock,
  redisMock,
  getSeasonMatchesMock,
  calculateStandingsMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), insert: vi.fn() },
  redisMock: { get: vi.fn(), setex: vi.fn() },
  getSeasonMatchesMock: vi.fn(),
  calculateStandingsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/lib/redis", () => ({ redis: redisMock }));
vi.mock("@/lib/football-data", () => ({ getSeasonMatches: getSeasonMatchesMock }));
vi.mock("@/lib/logger", () => ({ logger: { warn: loggerWarnMock, error: loggerErrorMock } }));
// Wraps the real implementation so every test gets true standings math by
// default; only the "impossible in production" branch test below overrides
// a single call to force a case calculateStandings' own invariants forbid.
vi.mock("@/lib/standings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/standings")>();
  calculateStandingsMock.mockImplementation(actual.calculateStandings);
  return { ...actual, calculateStandings: calculateStandingsMock };
});

const ACTIVE_SEASON = 2025;
const PAST_SEASON = 2024;
const REFRESH_INTERVAL_SECONDS = 3600;
const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_SECONDS * 1000;

// The interval is read once at module load, so it is pinned here rather than
// inherited from whatever .env happens to configure locally.
let needsRefresh: typeof import("@/lib/standings-service").needsRefresh;

function storedAt(msAgo: number) {
  return [{ updatedAt: new Date(Date.now() - msAgo) }];
}

const match: NormalizedProviderMatch = {
  providerMatchId: 1,
  competitionCode: "PL",
  seasonId: ACTIVE_SEASON,
  status: "FINISHED",
  kickoffAt: new Date("2025-08-15T14:00:00Z"),
  matchday: 1,
  homeTeamProviderId: 1,
  homeTeamName: "Arsenal FC",
  awayTeamProviderId: 2,
  awayTeamName: "Chelsea FC",
  homeGoals: 2,
  awayGoals: 1,
};

function storedMatch(overrides: Partial<NormalizedProviderMatch> & { updatedAt: Date }) {
  return { ...match, ...overrides };
}

function mockStoredMatches(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValue({ from });
}

function mockMaxMatchdayRow(maxMatchday: number | null | undefined) {
  const rows = maxMatchday === undefined ? [] : [{ maxMatchday }];
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValue({ from });
}

function mockInsert() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  dbMock.insert.mockReturnValue({ values });
  return { values, onConflictDoUpdate };
}

describe("needsRefresh", () => {
  beforeEach(async () => {
    vi.stubEnv("FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS", String(REFRESH_INTERVAL_SECONDS));
    vi.resetModules();
    ({ needsRefresh } = await import("@/lib/standings-service"));
  });

  it("refreshes when nothing is stored for the season", () => {
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, [])).toBe(true);
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, [])).toBe(true);
  });

  it("never refreshes a past season that has stored matches, however stale", () => {
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, storedAt(0))).toBe(false);
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS * 24))).toBe(
      false
    );
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS * 24 * 365))).toBe(
      false
    );
  });

  it("keeps fresh active-season data without refreshing", () => {
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(0))).toBe(false);
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS / 2))).toBe(
      false
    );
  });

  it("refreshes the active season once the threshold has elapsed", () => {
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS))).toBe(true);
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(REFRESH_INTERVAL_MS * 2))).toBe(
      true
    );
  });

  it("falls back to the one-hour default when the configured interval is not a positive number", async () => {
    vi.stubEnv("FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS", "not-a-number");
    vi.resetModules();
    ({ needsRefresh } = await import("@/lib/standings-service"));

    const DEFAULT_REFRESH_INTERVAL_SECONDS = 3600;
    expect(
      needsRefresh(
        ACTIVE_SEASON,
        ACTIVE_SEASON,
        storedAt(DEFAULT_REFRESH_INTERVAL_SECONDS * 1000 - 1)
      )
    ).toBe(false);
    expect(
      needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, storedAt(DEFAULT_REFRESH_INTERVAL_SECONDS * 1000))
    ).toBe(true);
  });
});

describe("getPremierLeagueStandings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached standings without querying the database", async () => {
    redisMock.get.mockResolvedValue(
      JSON.stringify([{ teamProviderId: 1, teamName: "Arsenal FC" }])
    );

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("reports an empty cached standings list as empty", async () => {
    redisMock.get.mockResolvedValue(JSON.stringify([]));

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "empty", standings: [] });
  });

  it("falls back to a fresh database query when the cache read fails", async () => {
    redisMock.get.mockRejectedValue(new Error("redis down"));
    mockStoredMatches([storedMatch({ updatedAt: new Date() })]);
    redisMock.setex.mockResolvedValue("OK");

    const result = await getPremierLeagueStandings({
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(dbMock.select).toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Standings cache read failed"
    );
  });

  it("refreshes from the provider when nothing is stored, and caches the result", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([match]);
    mockInsert();
    redisMock.setex.mockResolvedValue("OK");

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(getSeasonMatchesMock).toHaveBeenCalledWith(ACTIVE_SEASON);
    expect(dbMock.insert).toHaveBeenCalled();
    expect(redisMock.setex).toHaveBeenCalledWith(
      `standings:PL:${ACTIVE_SEASON}`,
      15 * 60,
      expect.any(String)
    );
    expect(result.status).toBe("ok");
    expect(result.standings[0]?.teamName).toBe("Arsenal FC");
  });

  it("reports empty standings when a refresh finds no finished matches", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();
    redisMock.setex.mockResolvedValue("OK");

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "empty", standings: [] });
  });

  it("falls back to stored matches when a refresh fails but stored data exists", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([storedMatch({ updatedAt: new Date(0) })]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(result.standings[0]?.teamName).toBe("Arsenal FC");
    expect(redisMock.setex).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), seasonId: ACTIVE_SEASON }),
      "Premier League refresh failed; using stored matches"
    );
  });

  it("returns an error when a refresh fails and nothing is stored", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "error", standings: [] });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), seasonId: ACTIVE_SEASON }),
      "Premier League refresh failed; using stored matches"
    );
  });

  it("serves a past season straight from storage without a refresh, and caches it", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([storedMatch({ updatedAt: new Date(0) })]);
    redisMock.setex.mockResolvedValue("OK");

    const result = await getPremierLeagueStandings({
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    expect(redisMock.setex).toHaveBeenCalled();
  });

  it("does not fail the cache write from breaking the response", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([storedMatch({ updatedAt: new Date(0) })]);
    redisMock.setex.mockRejectedValue(new Error("redis down"));

    const result = await getPremierLeagueStandings({
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Standings cache write failed"
    );
  });

  it("reports empty standings for stored matches that calculate to no standings", async () => {
    // calculateStandings never actually returns [] for a non-empty match list
    // (every match seeds at least one team), so this forces the case to prove
    // the defensive empty-check on the non-refresh path behaves correctly.
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([storedMatch({ updatedAt: new Date(0) })]);
    calculateStandingsMock.mockReturnValueOnce([]);

    const result = await getPremierLeagueStandings({
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "empty", standings: [] });
    expect(redisMock.setex).not.toHaveBeenCalled();
  });

  it("returns an error when the database query itself fails", async () => {
    redisMock.get.mockResolvedValue(null);
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "error", standings: [] });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), seasonId: ACTIVE_SEASON }),
      "Unable to load Premier League standings"
    );
  });

  it("filters stored matches by round and bypasses the cache entirely", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, matchday: 1, updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 2, matchday: 2, updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 3, matchday: 3, updatedAt: new Date(0) }),
    ]);

    const result = await getPremierLeagueStandings({
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
      round: 2,
    });

    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.setex).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    expect(result.standings.reduce((sum, team) => sum + team.played, 0)).toBe(4);
  });

  it("excludes matches with no known matchday from a round filter", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, matchday: 1, updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 2, matchday: null, updatedAt: new Date(0) }),
    ]);

    const result = await getPremierLeagueStandings({
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
      round: 5,
    });

    expect(result.status).toBe("ok");
    expect(result.standings.reduce((sum, team) => sum + team.played, 0)).toBe(2);
  });

  it("filters freshly refreshed provider matches by round and skips caching the round-scoped result", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([
      { ...match, providerMatchId: 1, matchday: 1 },
      { ...match, providerMatchId: 2, matchday: 5 },
    ]);
    mockInsert();

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
      round: 1,
    });

    expect(result.status).toBe("ok");
    expect(redisMock.setex).not.toHaveBeenCalled();
    expect(result.standings.reduce((sum, team) => sum + team.played, 0)).toBe(2);
  });

  it("only feeds FINISHED matches to calculateStandings on the stored-matches path", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, status: "FINISHED", updatedAt: new Date(0) }),
      storedMatch({
        providerMatchId: 2,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getPremierLeagueStandings({
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(calculateStandingsMock).toHaveBeenLastCalledWith([
      expect.objectContaining({ providerMatchId: 1, status: "FINISHED" }),
    ]);
  });

  it("only feeds FINISHED matches to calculateStandings on the freshly-refreshed-from-provider path", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([
      { ...match, providerMatchId: 1, status: "FINISHED" },
      { ...match, providerMatchId: 2, status: "SCHEDULED", homeGoals: null, awayGoals: null },
    ]);
    mockInsert();

    const result = await getPremierLeagueStandings({
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(calculateStandingsMock).toHaveBeenLastCalledWith([
      expect.objectContaining({ providerMatchId: 1, status: "FINISHED" }),
    ]);
  });
});

describe("getTeamMatches", () => {
  const HOME_TEAM_ID = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the team's matches sorted by kickoff, including unplayed ones, excluding other teams", async () => {
    mockStoredMatches([
      storedMatch({
        providerMatchId: 3,
        kickoffAt: new Date("2025-09-01"),
        homeTeamProviderId: HOME_TEAM_ID,
        awayTeamProviderId: 3,
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 1,
        kickoffAt: new Date("2025-08-01"),
        homeTeamProviderId: HOME_TEAM_ID,
        awayTeamProviderId: 2,
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 2,
        kickoffAt: new Date("2025-08-15"),
        homeTeamProviderId: 4,
        awayTeamProviderId: HOME_TEAM_ID,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 4,
        kickoffAt: new Date("2025-08-20"),
        homeTeamProviderId: 5,
        awayTeamProviderId: 6,
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getTeamMatches(HOME_TEAM_ID, PAST_SEASON, ACTIVE_SEASON);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([
      1, 2, 3,
    ]);
  });

  it("triggers the shared sync path when nothing is stored yet, same as standings", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([
      { ...match, providerMatchId: 1, homeTeamProviderId: HOME_TEAM_ID },
    ]);
    mockInsert();

    const result = await getTeamMatches(HOME_TEAM_ID, ACTIVE_SEASON, ACTIVE_SEASON);

    expect(getSeasonMatchesMock).toHaveBeenCalledWith(ACTIVE_SEASON);
    expect(dbMock.insert).toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  it("reports not_found when the team never appears in the season's matches", async () => {
    mockStoredMatches([
      storedMatch({
        providerMatchId: 1,
        homeTeamProviderId: 9,
        awayTeamProviderId: 8,
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getTeamMatches(HOME_TEAM_ID, PAST_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "not_found" });
  });

  it("reports empty when the season truly has no matches", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getTeamMatches(HOME_TEAM_ID, ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "empty" });
  });

  it("reports error when refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getTeamMatches(HOME_TEAM_ID, ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
  });

  it("reports error when the database query itself fails", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getTeamMatches(HOME_TEAM_ID, ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
  });
});

describe("getRoundMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matches for an explicitly requested round, sorted by kickoff time", async () => {
    mockStoredMatches([
      storedMatch({
        providerMatchId: 2,
        matchday: 3,
        kickoffAt: new Date("2025-09-15"),
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 1,
        matchday: 3,
        kickoffAt: new Date("2025-09-14"),
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 3,
        matchday: 4,
        kickoffAt: new Date("2025-09-20"),
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getRoundMatches(PAST_SEASON, 3, ACTIVE_SEASON);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.round).toBe(3);
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([1, 2]);
  });

  it("defaults to the round containing the next unplayed match when no round is requested", async () => {
    mockStoredMatches([
      storedMatch({
        providerMatchId: 1,
        matchday: 1,
        status: "FINISHED",
        kickoffAt: new Date("2025-08-15"),
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 2,
        matchday: 2,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        kickoffAt: new Date("2025-08-22"),
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getRoundMatches(PAST_SEASON, undefined, ACTIVE_SEASON);

    expect(result.status === "ok" && result.round).toBe(2);
  });

  it("defaults to the last round when every match is finished", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, matchday: 1, status: "FINISHED", updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 2, matchday: 2, status: "FINISHED", updatedAt: new Date(0) }),
    ]);

    const result = await getRoundMatches(PAST_SEASON, undefined, ACTIVE_SEASON);

    expect(result.status === "ok" && result.round).toBe(2);
  });

  it("reports ok with an empty list for an in-range round with no matches", async () => {
    mockStoredMatches([storedMatch({ providerMatchId: 1, matchday: 1, updatedAt: new Date(0) })]);

    const result = await getRoundMatches(PAST_SEASON, 2, ACTIVE_SEASON);

    expect(result).toEqual({ status: "ok", round: 2, matches: [] });
  });

  it("triggers the shared sync path when nothing is stored yet, same as standings", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([match]);
    mockInsert();

    const result = await getRoundMatches(ACTIVE_SEASON, undefined, ACTIVE_SEASON);

    expect(getSeasonMatchesMock).toHaveBeenCalledWith(ACTIVE_SEASON);
    expect(dbMock.insert).toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  it("reports empty when the season truly has no matches", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getRoundMatches(ACTIVE_SEASON, undefined, ACTIVE_SEASON);

    expect(result).toEqual({ status: "empty" });
  });

  it("reports empty when stored matches have no known matchday", async () => {
    mockStoredMatches([storedMatch({ matchday: null, updatedAt: new Date(0) })]);

    const result = await getRoundMatches(PAST_SEASON, undefined, ACTIVE_SEASON);

    expect(result).toEqual({ status: "empty" });
  });

  it("reports error when refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getRoundMatches(ACTIVE_SEASON, undefined, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
  });

  it("reports error when the database query itself fails", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getRoundMatches(ACTIVE_SEASON, undefined, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), seasonId: ACTIVE_SEASON }),
      "Unable to load round matches"
    );
  });
});

describe("getMaxMatchday", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the highest known matchday for the season", async () => {
    mockMaxMatchdayRow(7);

    await expect(getMaxMatchday(ACTIVE_SEASON)).resolves.toBe(7);
  });

  it("returns null when no matches are stored for the season", async () => {
    mockMaxMatchdayRow(null);

    await expect(getMaxMatchday(ACTIVE_SEASON)).resolves.toBeNull();
  });

  it("returns null when the query yields no row", async () => {
    mockMaxMatchdayRow(undefined);

    await expect(getMaxMatchday(ACTIVE_SEASON)).resolves.toBeNull();
  });
});

describe("synchronizeMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing for an empty match list", async () => {
    await synchronizeMatches([]);

    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("upserts provider matches with a fresh updatedAt", async () => {
    const { values, onConflictDoUpdate } = mockInsert();

    await synchronizeMatches([match]);

    expect(dbMock.insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ ...match, updatedAt: expect.any(Date) }),
    ]);
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.anything() })
    );
  });
});
