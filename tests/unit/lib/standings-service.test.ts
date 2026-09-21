import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedProviderMatch } from "@/lib/football-data";
import {
  getCupSeason,
  getMaxMatchday,
  getRoundMatches,
  getStandings,
  getTeamCleanSheetSeries,
  getTeamComebacks,
  getTeamFormSeries,
  getTeamGoalsSeries,
  getTeamHomeAwaySeries,
  getTeamMatches,
  getTeamPositionSeries,
  getTeamStreaks,
  synchronizeMatches,
} from "@/lib/standings-service";
import { warmModules } from "../../support/warm-module";

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

/**
 * Puts `calculateStandings` back to the real implementation before every test.
 *
 * One test below queues a `mockReturnValueOnce` to force a case the real
 * function's invariants forbid. `clearAllMocks` clears *calls*, not queued
 * one-shot results — so an unconsumed one is inherited by whatever test runs
 * next, and which test that is depends on declaration order. `mockReset`
 * drains the queue; the implementation then has to be set again, because
 * resetting removes that too.
 */
beforeEach(async () => {
  /**
   * Every shared mock back to "not configured" before each test.
   *
   * `clearAllMocks` clears *calls*, not implementations or queued one-shot
   * results, and several tests below set a permanent one — a Redis cache hit,
   * a stored-match list. Inherited, those decide the next test's answer: a
   * leftover cache hit makes `getStandings` return early, so an assertion about
   * what reached `calculateStandings` fails with "never called" and does so
   * only in some orders.
   */
  // The logger spies too: several tests assert that a path warned or errored,
  // and calls left by an earlier test would satisfy a bare `toHaveBeenCalled`
  // whether or not this one logged anything.
  loggerWarnMock.mockClear();
  loggerErrorMock.mockClear();

  redisMock.get.mockReset();
  redisMock.setex.mockReset();
  dbMock.select.mockReset();
  dbMock.insert.mockReset();
  getSeasonMatchesMock.mockReset();

  // Reset clears the implementation too, and this one is the real function —
  // the point of the wrapper is that every test gets true standings maths
  // unless it says otherwise.
  const actual = await vi.importActual<typeof import("@/lib/standings")>("@/lib/standings");
  calculateStandingsMock.mockReset();
  calculateStandingsMock.mockImplementation(actual.calculateStandings);
});

const COMPETITION_CODE = "PL";
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
  competitionCode: COMPETITION_CODE,
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
  halfTimeHome: null,
  halfTimeAway: null,
  stage: null,
  groupName: null,
  regularTimeHome: null,
  regularTimeAway: null,
  extraTimeHome: null,
  extraTimeAway: null,
  penaltiesHome: null,
  penaltiesAway: null,
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

warmModules(() => import("@/lib/standings-service"));

describe("needsRefresh", () => {
  beforeEach(async () => {
    // The clock is frozen because these assertions sit *on* the threshold.
    // `storedAt` reads `Date.now()` to build the timestamp and `needsRefresh`
    // reads it again to compare, so on a live clock a case one millisecond
    // below the interval flips to `true` whenever those two reads land in
    // different milliseconds — which the `vi.resetModules()` and dynamic
    // `import()` below make entirely possible.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-08-15T12:00:00Z"));

    vi.stubEnv("FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS", String(REFRESH_INTERVAL_SECONDS));
    vi.resetModules();
    ({ needsRefresh } = await import("@/lib/standings-service"));
  });

  afterEach(() => {
    vi.useRealTimers();
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

describe("getStandings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached standings without querying the database", async () => {
    redisMock.get.mockResolvedValue(
      JSON.stringify([{ teamProviderId: 1, teamName: "Arsenal FC" }])
    );

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("reports an empty cached standings list as empty", async () => {
    redisMock.get.mockResolvedValue(JSON.stringify([]));

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "empty", standings: [] });
  });

  it("falls back to a fresh database query when the cache read fails", async () => {
    redisMock.get.mockRejectedValue(new Error("redis down"));
    mockStoredMatches([storedMatch({ updatedAt: new Date() })]);
    redisMock.setex.mockResolvedValue("OK");

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
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

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(getSeasonMatchesMock).toHaveBeenCalledWith(COMPETITION_CODE, ACTIVE_SEASON);
    expect(dbMock.insert).toHaveBeenCalled();
    expect(redisMock.setex).toHaveBeenCalledWith(
      `standings:${COMPETITION_CODE}:${ACTIVE_SEASON}`,
      15 * 60,
      expect.any(String)
    );
    expect(result.status).toBe("ok");
    expect(result.standings[0]?.teamName).toBe("Arsenal FC");
  });

  it("caches different competitions' standings for the same season under separate keys", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([match]);
    mockInsert();
    redisMock.setex.mockResolvedValue("OK");

    await getStandings({
      competitionCode: "PL",
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });
    await getStandings({
      competitionCode: "BL1",
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(redisMock.setex.mock.calls.map(([key]) => key)).toEqual([
      `standings:PL:${ACTIVE_SEASON}`,
      `standings:BL1:${ACTIVE_SEASON}`,
    ]);
  });

  it("reports empty standings when a refresh finds no finished matches", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();
    redisMock.setex.mockResolvedValue("OK");

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "empty", standings: [] });
  });

  it("falls back to stored matches when a refresh fails but stored data exists", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([storedMatch({ updatedAt: new Date(0) })]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(result.standings[0]?.teamName).toBe("Arsenal FC");
    expect(redisMock.setex).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        competitionCode: COMPETITION_CODE,
        seasonId: ACTIVE_SEASON,
      }),
      "Competition refresh failed; using stored matches"
    );
  });

  it("returns an error when a refresh fails and nothing is stored", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "error", standings: [] });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        competitionCode: COMPETITION_CODE,
        seasonId: ACTIVE_SEASON,
      }),
      "Competition refresh failed; using stored matches"
    );
  });

  it("serves a past season straight from storage without a refresh, and caches it", async () => {
    redisMock.get.mockResolvedValue(null);
    mockStoredMatches([storedMatch({ updatedAt: new Date(0) })]);
    redisMock.setex.mockResolvedValue("OK");

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
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

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
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

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
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

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result).toEqual({ status: "error", standings: [] });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        competitionCode: COMPETITION_CODE,
        seasonId: ACTIVE_SEASON,
      }),
      "Unable to load standings"
    );
  });

  it("filters stored matches by round and bypasses the cache entirely", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, matchday: 1, updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 2, matchday: 2, updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 3, matchday: 3, updatedAt: new Date(0) }),
    ]);

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
      round: 2,
    });

    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.setex).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    expect(
      result.status === "ok" && result.standings.reduce((sum, team) => sum + team.played, 0)
    ).toBe(4);
  });

  it("excludes matches with no known matchday from a round filter", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, matchday: 1, updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 2, matchday: null, updatedAt: new Date(0) }),
    ]);

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
      round: 5,
    });

    expect(result.status).toBe("ok");
    expect(
      result.status === "ok" && result.standings.reduce((sum, team) => sum + team.played, 0)
    ).toBe(2);
  });

  it("filters freshly refreshed provider matches by round and skips caching the round-scoped result", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([
      { ...match, providerMatchId: 1, matchday: 1 },
      { ...match, providerMatchId: 2, matchday: 5 },
    ]);
    mockInsert();

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
      round: 1,
    });

    expect(result.status).toBe("ok");
    expect(redisMock.setex).not.toHaveBeenCalled();
    expect(
      result.status === "ok" && result.standings.reduce((sum, team) => sum + team.played, 0)
    ).toBe(2);
  });

  it("only feeds FINISHED matches to calculateStandings on the stored-matches path", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, status: "FINISHED", updatedAt: new Date(0) }),
      storedMatch({
        providerMatchId: 2,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        halfTimeHome: null,
        halfTimeAway: null,
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(calculateStandingsMock).toHaveBeenLastCalledWith(
      [expect.objectContaining({ providerMatchId: 1, status: "FINISHED" })],
      [
        expect.objectContaining({ providerMatchId: 1, status: "FINISHED" }),
        expect.objectContaining({ providerMatchId: 2, status: "SCHEDULED" }),
      ]
    );
  });

  it("only feeds FINISHED matches to calculateStandings on the freshly-refreshed-from-provider path", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([
      { ...match, providerMatchId: 1, status: "FINISHED" },
      { ...match, providerMatchId: 2, status: "SCHEDULED", homeGoals: null, awayGoals: null },
    ]);
    mockInsert();

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: ACTIVE_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    expect(calculateStandingsMock).toHaveBeenLastCalledWith(
      [expect.objectContaining({ providerMatchId: 1, status: "FINISHED" })],
      [
        expect.objectContaining({ providerMatchId: 1, status: "FINISHED" }),
        expect.objectContaining({ providerMatchId: 2, status: "SCHEDULED" }),
      ]
    );
  });

  it("shows a team with only a scheduled match as a zero-stats row alongside teams that have played", async () => {
    mockStoredMatches([
      storedMatch({
        providerMatchId: 1,
        status: "FINISHED",
        homeTeamProviderId: 1,
        homeTeamName: "Arsenal FC",
        awayTeamProviderId: 2,
        awayTeamName: "Chelsea FC",
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 2,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        halfTimeHome: null,
        halfTimeAway: null,
        homeTeamProviderId: 3,
        homeTeamName: "Brighton FC",
        awayTeamProviderId: 1,
        awayTeamName: "Arsenal FC",
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    const brighton =
      result.status === "ok" && result.standings.find((team) => team.teamName === "Brighton FC");
    expect(brighton).toMatchObject({ played: 0, points: 0 });
  });

  it("shows a team whose only match is POSTPONED as a zero-stats row, same as any other non-FINISHED status", async () => {
    mockStoredMatches([
      storedMatch({
        providerMatchId: 1,
        status: "FINISHED",
        homeTeamProviderId: 1,
        homeTeamName: "Arsenal FC",
        awayTeamProviderId: 2,
        awayTeamName: "Chelsea FC",
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 2,
        status: "POSTPONED",
        homeGoals: null,
        awayGoals: null,
        halfTimeHome: null,
        halfTimeAway: null,
        homeTeamProviderId: 3,
        homeTeamName: "Brighton FC",
        awayTeamProviderId: 1,
        awayTeamName: "Arsenal FC",
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });

    expect(result.status).toBe("ok");
    const brighton =
      result.status === "ok" && result.standings.find((team) => team.teamName === "Brighton FC");
    expect(brighton).toMatchObject({ played: 0, points: 0 });
  });

  it("keeps a winless team in a round-filtered standings view even when its only match falls after that round", async () => {
    mockStoredMatches([
      storedMatch({
        providerMatchId: 1,
        status: "FINISHED",
        matchday: 1,
        homeTeamProviderId: 1,
        homeTeamName: "Arsenal FC",
        awayTeamProviderId: 2,
        awayTeamName: "Chelsea FC",
        updatedAt: new Date(0),
      }),
      storedMatch({
        providerMatchId: 2,
        status: "SCHEDULED",
        matchday: 5,
        homeGoals: null,
        awayGoals: null,
        halfTimeHome: null,
        halfTimeAway: null,
        homeTeamProviderId: 3,
        homeTeamName: "Brighton FC",
        awayTeamProviderId: 1,
        awayTeamName: "Arsenal FC",
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
      round: 1,
    });

    expect(result.status).toBe("ok");
    const teamNames = result.status === "ok" && result.standings.map((team) => team.teamName);
    expect(teamNames).toContain("Brighton FC");
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
        halfTimeHome: null,
        halfTimeAway: null,
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

    const result = await getTeamMatches(COMPETITION_CODE, HOME_TEAM_ID, PAST_SEASON, ACTIVE_SEASON);

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

    const result = await getTeamMatches(
      COMPETITION_CODE,
      HOME_TEAM_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON
    );

    expect(getSeasonMatchesMock).toHaveBeenCalledWith(COMPETITION_CODE, ACTIVE_SEASON);
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

    const result = await getTeamMatches(COMPETITION_CODE, HOME_TEAM_ID, PAST_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "not_found" });
  });

  it("reports empty when the season truly has no matches", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getTeamMatches(
      COMPETITION_CODE,
      HOME_TEAM_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON
    );

    expect(result).toEqual({ status: "empty" });
  });

  it("reports error when refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getTeamMatches(
      COMPETITION_CODE,
      HOME_TEAM_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON
    );

    expect(result).toEqual({ status: "error" });
  });

  it("reports error when the database query itself fails", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getTeamMatches(
      COMPETITION_CODE,
      HOME_TEAM_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON
    );

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

    const result = await getRoundMatches(COMPETITION_CODE, PAST_SEASON, 3, ACTIVE_SEASON);

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
        halfTimeHome: null,
        halfTimeAway: null,
        kickoffAt: new Date("2025-08-22"),
        updatedAt: new Date(0),
      }),
    ]);

    const result = await getRoundMatches(COMPETITION_CODE, PAST_SEASON, undefined, ACTIVE_SEASON);

    expect(result.status === "ok" && result.round).toBe(2);
  });

  it("defaults to the last round when every match is finished", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, matchday: 1, status: "FINISHED", updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 2, matchday: 2, status: "FINISHED", updatedAt: new Date(0) }),
    ]);

    const result = await getRoundMatches(COMPETITION_CODE, PAST_SEASON, undefined, ACTIVE_SEASON);

    expect(result.status === "ok" && result.round).toBe(2);
  });

  it("reports ok with an empty list for an in-range round with no matches", async () => {
    mockStoredMatches([storedMatch({ providerMatchId: 1, matchday: 1, updatedAt: new Date(0) })]);

    const result = await getRoundMatches(COMPETITION_CODE, PAST_SEASON, 2, ACTIVE_SEASON);

    expect(result).toEqual({ status: "ok", round: 2, matches: [] });
  });

  it("triggers the shared sync path when nothing is stored yet, same as standings", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([match]);
    mockInsert();

    const result = await getRoundMatches(COMPETITION_CODE, ACTIVE_SEASON, undefined, ACTIVE_SEASON);

    expect(getSeasonMatchesMock).toHaveBeenCalledWith(COMPETITION_CODE, ACTIVE_SEASON);
    expect(dbMock.insert).toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  it("reports empty when the season truly has no matches", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getRoundMatches(COMPETITION_CODE, ACTIVE_SEASON, undefined, ACTIVE_SEASON);

    expect(result).toEqual({ status: "empty" });
  });

  it("reports empty when stored matches have no known matchday", async () => {
    mockStoredMatches([storedMatch({ matchday: null, updatedAt: new Date(0) })]);

    const result = await getRoundMatches(COMPETITION_CODE, PAST_SEASON, undefined, ACTIVE_SEASON);

    expect(result).toEqual({ status: "empty" });
  });

  it("reports error when refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getRoundMatches(COMPETITION_CODE, ACTIVE_SEASON, undefined, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
  });

  it("reports error when the database query itself fails", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getRoundMatches(COMPETITION_CODE, ACTIVE_SEASON, undefined, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        competitionCode: COMPETITION_CODE,
        seasonId: ACTIVE_SEASON,
      }),
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

    await expect(getMaxMatchday(COMPETITION_CODE, ACTIVE_SEASON)).resolves.toBe(7);
  });

  it("returns null when no matches are stored for the season", async () => {
    mockMaxMatchdayRow(null);

    await expect(getMaxMatchday(COMPETITION_CODE, ACTIVE_SEASON)).resolves.toBeNull();
  });

  it("returns null when the query yields no row", async () => {
    mockMaxMatchdayRow(undefined);

    await expect(getMaxMatchday(COMPETITION_CODE, ACTIVE_SEASON)).resolves.toBeNull();
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

describe("getCupSeason", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the season's full match list, every stage included", async () => {
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, stage: "LEAGUE_STAGE", updatedAt: new Date(0) }),
      storedMatch({ providerMatchId: 2, stage: "FINAL", updatedAt: new Date(0) }),
    ]);

    const result = await getCupSeason("CL", PAST_SEASON, ACTIVE_SEASON);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches).toHaveLength(2);
    expect(result.status === "ok" && result.matches.map((row) => row.stage)).toEqual([
      "LEAGUE_STAGE",
      "FINAL",
    ]);
  });

  it("reports an empty season when nothing is stored and the refresh succeeded", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);

    const result = await getCupSeason("CL", PAST_SEASON, ACTIVE_SEASON);

    expect(result.status).toBe("empty");
  });

  it("reports an error when the refresh failed and nothing was stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    const result = await getCupSeason("CL", ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result.status).toBe("error");
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  it("serves stored matches when the refresh failed but data is present", async () => {
    // The bracket must still render from the database when the provider is
    // unreachable — the reason the score breakdown is stored at all.
    mockStoredMatches([
      storedMatch({ providerMatchId: 1, stage: "FINAL", updatedAt: new Date(0) }),
    ]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    const result = await getCupSeason("CL", ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches).toHaveLength(1);
  });

  it("reports an error and logs when the database itself throws", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("connection refused");
    });

    const result = await getCupSeason("CL", PAST_SEASON, ACTIVE_SEASON);

    expect(result.status).toBe("error");
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});

describe("getTeamPositionSeries", () => {
  /** A finished match of a completed season, which is never refetched. */
  function playedIn(
    matchday: number,
    home: number,
    away: number,
    homeGoals: number,
    awayGoals: number
  ) {
    return storedMatch({
      providerMatchId: matchday * 100 + home * 10 + away,
      seasonId: PAST_SEASON,
      matchday,
      homeTeamProviderId: home,
      homeTeamName: `Team ${home}`,
      awayTeamProviderId: away,
      awayTeamName: `Team ${away}`,
      homeGoals,
      awayGoals,
      updatedAt: new Date(),
    });
  }

  /** Four teams, a round each for team 1 to climb. */
  const season = [
    playedIn(1, 2, 1, 2, 0),
    playedIn(1, 3, 4, 1, 0),
    playedIn(2, 1, 4, 3, 0),
    playedIn(2, 2, 3, 0, 0),
    playedIn(3, 1, 3, 2, 0),
    playedIn(3, 4, 2, 1, 0),
  ];

  it("plots the team's position after every round of the season", async () => {
    mockStoredMatches(season);

    const series = await getTeamPositionSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(series).toEqual({
      status: "ok",
      points: [
        { round: 1, position: 4, played: true },
        { round: 2, position: 3, played: true },
        { round: 3, position: 1, played: true },
      ],
      teamCount: 4,
      endsAtSplit: false,
    });
  });

  it("equals the position `getStandings({ round })` gives for every round", async () => {
    /**
     * The property the whole feature rests on: the chart and the standings
     * page's round selector must never disagree. Checked against the real
     * `getStandings`, not against a restatement of its arguments.
     */
    mockStoredMatches(season);
    const series = await getTeamPositionSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);
    if (series.status !== "ok") throw new Error("expected a series");

    for (const point of series.points) {
      const standings = await getStandings({
        competitionCode: COMPETITION_CODE,
        seasonId: PAST_SEASON,
        activeSeasonId: ACTIVE_SEASON,
        round: point.round,
      });
      const row =
        standings.status === "ok"
          ? standings.standings.find((team) => team.teamProviderId === 1)
          : undefined;

      expect(row?.position, `round ${point.round}`).toBe(point.position);
    }
  });

  it("reads the season once, however many rounds it has, and asks no provider", async () => {
    /**
     * #331's constraint: ranking per round must not become a fetch per round.
     * Ten rounds here, and still one read — the in-memory tables are the only
     * thing that grows with the season.
     */
    const tenRounds = Array.from({ length: 10 }, (_, index) => [
      playedIn(index + 1, 1, 2, index % 3, 1),
      playedIn(index + 1, 3, 4, 1, index % 2),
    ]).flat();
    mockStoredMatches(tenRounds);

    const series = await getTeamPositionSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(series.status === "ok" && series.points).toHaveLength(10);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("reports no rounds for a season with nothing stored yet", async () => {
    mockStoredMatches([]);
    // Nothing stored means a refresh is attempted, and the provider has nothing
    // either — an empty season, not a failed one.
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    expect(await getTeamPositionSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "no-rounds",
    });
  });

  it("reports an error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    expect(await getTeamPositionSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
  });

  it("reports an error, and logs it, when the season cannot be read at all", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(await getTeamPositionSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competitionCode: COMPETITION_CODE, teamProviderId: 1 }),
      "Unable to compute the league position series"
    );
  });
});

/** Team 1's match on `day` of a completed season, which is never refetched. */
function playedOn(day: number, opponent: number, own: number, other: number, home = true) {
  return storedMatch({
    providerMatchId: day,
    seasonId: PAST_SEASON,
    kickoffAt: new Date(`2024-09-${String(day).padStart(2, "0")}T15:00:00Z`),
    matchday: day,
    homeTeamProviderId: home ? 1 : opponent,
    homeTeamName: home ? "Team 1" : `Team ${opponent}`,
    awayTeamProviderId: home ? opponent : 1,
    awayTeamName: home ? `Team ${opponent}` : "Team 1",
    homeGoals: home ? own : other,
    awayGoals: home ? other : own,
    halfTimeHome: null,
    halfTimeAway: null,
    updatedAt: new Date(),
  });
}

/** W D L W W L, home and away: 3 1 0 3 3 0. */
const season = [
  playedOn(1, 2, 2, 0),
  playedOn(2, 3, 1, 1, false),
  playedOn(3, 4, 0, 1),
  playedOn(4, 2, 2, 1, false),
  playedOn(5, 3, 1, 0),
  playedOn(6, 4, 0, 2, false),
];

describe("getTeamFormSeries", () => {
  it("gives the team's form after each match from the fifth", async () => {
    mockStoredMatches(season);

    expect(await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      points: [
        { match: 5, form: (3 + 1 + 0 + 3 + 3) / 5 },
        { match: 6, form: (1 + 0 + 3 + 3 + 0) / 5 },
      ],
    });
  });

  it("ends at the Vire column the standings page shows, in points", async () => {
    // The property the feature rests on, against the real `getStandings`.
    mockStoredMatches(season);
    const series = await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);
    mockStoredMatches(season);
    const standings = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });
    const row =
      standings.status === "ok"
        ? standings.standings.find((team) => team.teamProviderId === 1)
        : undefined;
    const points = { V: 3, T: 1, H: 0 } as const;
    const vire = (row?.form ?? []).reduce((total, entry) => total + points[entry.result], 0);

    expect(row?.form).toHaveLength(5);
    expect(series.status === "ok" && series.points.at(-1)?.form).toBe(vire / 5);
  });

  it("counts only finished matches", async () => {
    const withUpcoming = [
      ...season,
      { ...playedOn(7, 2, 0, 0), status: "SCHEDULED", homeGoals: null, awayGoals: null },
    ];
    mockStoredMatches(withUpcoming);

    const series = await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(series.status === "ok" && series.points.map((point) => point.match)).toEqual([5, 6]);
  });

  it("has no series before the team's fifth match", async () => {
    mockStoredMatches(season.slice(0, 4));

    expect(await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "too-few",
    });
  });

  it("reads the season once and asks no provider", async () => {
    mockStoredMatches(season);

    await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("has no series for a season with nothing stored yet", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    expect(await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "too-few",
    });
  });

  it("reports an error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    expect(await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
  });

  it("reports an error, and logs it, when the season cannot be read at all", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competitionCode: COMPETITION_CODE, teamProviderId: 1 }),
      "Unable to compute the form series"
    );
  });
});

describe("getTeamGoalsSeries", () => {
  it("gives running totals and five-match averages from the team's own side", async () => {
    mockStoredMatches(season);

    const series = await getTeamGoalsSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    // Own goals first: 2–0, 1–1, 0–1, 2–1, 1–0, 0–2.
    expect(series).toEqual({
      status: "ok",
      totals: [
        { match: 1, scored: 2, conceded: 0 },
        { match: 2, scored: 3, conceded: 1 },
        { match: 3, scored: 3, conceded: 2 },
        { match: 4, scored: 5, conceded: 3 },
        { match: 5, scored: 6, conceded: 3 },
        { match: 6, scored: 6, conceded: 5 },
      ],
      rolling: [
        { match: 5, scored: 6 / 5, conceded: 3 / 5 },
        { match: 6, scored: 4 / 5, conceded: 5 / 5 },
      ],
    });
  });

  it("ends its totals at the TM and PM the standings page shows", async () => {
    // The property the running-total chart rests on, against the real
    // `getStandings`.
    mockStoredMatches(season);
    const series = await getTeamGoalsSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);
    mockStoredMatches(season);
    const standings = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });
    const row =
      standings.status === "ok"
        ? standings.standings.find((team) => team.teamProviderId === 1)
        : undefined;

    expect(series.status === "ok" && series.totals.at(-1)).toMatchObject({
      scored: row?.goalsFor,
      conceded: row?.goalsAgainst,
    });
  });

  it("counts exactly the matches the form chart counts", async () => {
    const withUpcoming = [
      ...season,
      { ...playedOn(7, 2, 0, 0), status: "SCHEDULED", homeGoals: null, awayGoals: null },
    ];
    mockStoredMatches(withUpcoming);
    const goals = await getTeamGoalsSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);
    mockStoredMatches(withUpcoming);
    const form = await getTeamFormSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(goals.status === "ok" && goals.totals).toHaveLength(6);
    expect(goals.status === "ok" && goals.rolling.map((point) => point.match)).toEqual(
      form.status === "ok" && form.points.map((point) => point.match)
    );
  });

  it("reads the season once and asks no provider", async () => {
    mockStoredMatches(season);

    await getTeamGoalsSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("has neither series for a season with nothing stored yet", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    expect(await getTeamGoalsSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      rolling: [],
      totals: [],
    });
  });

  it("reports an error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    expect(await getTeamGoalsSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
  });

  it("reports an error, and logs it, when the season cannot be read at all", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(await getTeamGoalsSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competitionCode: COMPETITION_CODE, teamProviderId: 1 }),
      "Unable to compute the goals series"
    );
  });
});

describe("getTeamHomeAwaySeries", () => {
  it("splits the season into home and away, from the team's own side", async () => {
    mockStoredMatches(season);

    // Home: 2–0 W, 0–1 L, 1–0 W. Away: 1–1 D, 2–1 W, 0–2 L.
    expect(await getTeamHomeAwaySeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      home: { matches: 3, won: 2, drawn: 0, lost: 1, scored: 3, conceded: 1 },
      away: { matches: 3, won: 1, drawn: 1, lost: 1, scored: 3, conceded: 4 },
    });
  });

  it("adds up to the row the standings page shows", async () => {
    // The property the panel rests on, against the real `getStandings`.
    mockStoredMatches(season);
    const series = await getTeamHomeAwaySeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);
    mockStoredMatches(season);
    const standings = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });
    const row =
      standings.status === "ok"
        ? standings.standings.find((team) => team.teamProviderId === 1)
        : undefined;
    if (series.status !== "ok") throw new Error("expected a series");
    const { home, away } = series;

    expect(home.matches + away.matches).toBe(row?.played);
    expect(home.scored + away.scored).toBe(row?.goalsFor);
    expect(home.conceded + away.conceded).toBe(row?.goalsAgainst);
    expect(3 * (home.won + away.won) + home.drawn + away.drawn).toBe(row?.points);
  });

  it("counts only finished matches", async () => {
    mockStoredMatches([
      ...season,
      { ...playedOn(7, 2, 0, 0), status: "SCHEDULED", homeGoals: null, awayGoals: null },
    ]);

    const series = await getTeamHomeAwaySeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(series.status === "ok" && series.home.matches).toBe(3);
  });

  it("reads the season once and asks no provider", async () => {
    mockStoredMatches(season);

    await getTeamHomeAwaySeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("has empty sides for a season with nothing stored yet", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const series = await getTeamHomeAwaySeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(series.status === "ok" && series.home.matches + series.away.matches).toBe(0);
  });

  it("reports an error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    expect(await getTeamHomeAwaySeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
  });

  it("reports an error, and logs it, when the season cannot be read at all", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(await getTeamHomeAwaySeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competitionCode: COMPETITION_CODE, teamProviderId: 1 }),
      "Unable to compute the home and away series"
    );
  });
});

describe("getTeamCleanSheetSeries", () => {
  it("keeps a running share over the season, from the team's own side", async () => {
    mockStoredMatches(season);

    // Conceded, in kickoff order: 0, 1, 1, 1, 0, 2 — two clean sheets in six.
    expect(await getTeamCleanSheetSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      points: [
        { match: 1, kept: 1, share: 100 },
        { match: 2, kept: 1, share: 50 },
        { match: 3, kept: 1, share: (1 / 3) * 100 },
        { match: 4, kept: 1, share: 25 },
        { match: 5, kept: 2, share: 40 },
        { match: 6, kept: 2, share: (2 / 6) * 100 },
      ],
    });
  });

  it("ends at the matches the standings page counts", async () => {
    mockStoredMatches(season);
    const series = await getTeamCleanSheetSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);
    mockStoredMatches(season);
    const standings = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });
    const row =
      standings.status === "ok"
        ? standings.standings.find((team) => team.teamProviderId === 1)
        : undefined;

    expect(series.status === "ok" && series.points.at(-1)?.match).toBe(row?.played);
  });

  it("counts only finished matches", async () => {
    mockStoredMatches([
      ...season,
      { ...playedOn(7, 2, 0, 0), status: "SCHEDULED", homeGoals: null, awayGoals: null },
    ]);

    const series = await getTeamCleanSheetSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(series.status === "ok" && series.points).toHaveLength(6);
  });

  it("reads the season once and asks no provider", async () => {
    mockStoredMatches(season);

    await getTeamCleanSheetSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("has no points for a season with nothing stored yet", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    expect(await getTeamCleanSheetSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      points: [],
    });
  });

  it("reports an error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    expect(await getTeamCleanSheetSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
  });

  it("reports an error, and logs it, when the season cannot be read at all", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(await getTeamCleanSheetSeries(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competitionCode: COMPETITION_CODE, teamProviderId: 1 }),
      "Unable to compute the clean-sheet series"
    );
  });
});

describe("getTeamStreaks", () => {
  it("counts the streaks over the season's own matches", async () => {
    mockStoredMatches(season);

    // W D L W W L, in kickoff order.
    expect(await getTeamStreaks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      current: { outcome: "defeat", length: 1 },
      longest: {
        wins: { length: 2, from: 4, to: 5 },
        unbeaten: { length: 2, from: 1, to: 2 },
        defeats: { length: 1, from: 3, to: 3 },
        winless: { length: 2, from: 2, to: 3 },
      },
    });
  });

  it("never counts more matches than the standings page played", async () => {
    mockStoredMatches(season);
    const streaks = await getTeamStreaks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);
    mockStoredMatches(season);
    const standings = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });
    const played =
      standings.status === "ok"
        ? standings.standings.find((team) => team.teamProviderId === 1)?.played
        : 0;
    if (streaks.status !== "ok") throw new Error("expected streaks");

    for (const streak of Object.values(streaks.longest)) {
      expect(streak?.length ?? 0).toBeLessThanOrEqual(played ?? 0);
      expect(streak?.to ?? 0).toBeLessThanOrEqual(played ?? 0);
    }
  });

  it("counts only finished matches", async () => {
    mockStoredMatches([
      ...season,
      { ...playedOn(7, 2, 5, 0), status: "SCHEDULED", homeGoals: null, awayGoals: null },
    ]);

    const streaks = await getTeamStreaks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(streaks.status === "ok" && streaks.current).toEqual({ outcome: "defeat", length: 1 });
  });

  it("reads the season once and asks no provider", async () => {
    mockStoredMatches(season);

    await getTeamStreaks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("has no streaks for a season with nothing stored yet", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    expect(await getTeamStreaks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      current: null,
      longest: { wins: null, unbeaten: null, defeats: null, winless: null },
    });
  });

  it("reports an error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    expect(await getTeamStreaks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
  });

  it("reports an error, and logs it, when the season cannot be read at all", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(await getTeamStreaks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competitionCode: COMPETITION_CODE, teamProviderId: 1 }),
      "Unable to compute the streaks"
    );
  });
});

/** The same match with a half-time score, given from team 1's own side. */
function withHalfTime<T extends { homeTeamProviderId: number }>(
  match: T,
  halfTime: readonly [number, number] | null
): T {
  if (halfTime === null) return match;
  const [own, other] = halfTime;
  const home = match.homeTeamProviderId === 1;
  return { ...match, halfTimeHome: home ? own : other, halfTimeAway: home ? other : own };
}

/**
 * The same six matches, with half-time scores from team 1's own side: trailed
 * and won, trailed and drew, trailed and lost, led and won, level — and one
 * match the provider gave no half-time score for. A seventh is added for the
 * case the six cannot supply: a lead given away (specs/037).
 */
const halfTimeSeason = [
  ...season.map((match, index) =>
    withHalfTime(match, ([[0, 1], [0, 1], [0, 1], [1, 0], [0, 0], null] as const)[index] ?? null)
  ),
  withHalfTime(playedOn(7, 2, 1, 2), [1, 0]),
];

/** No match trailed or led: `trailed` and `led` are the directions' totals. */
const NO_DIRECTION = { matches: 0, won: 0, drew: 0, lost: 0 };

describe("getTeamComebacks", () => {
  it("counts what became of the matches the team trailed and led at half-time", async () => {
    mockStoredMatches(halfTimeSeason);

    expect(await getTeamComebacks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      trailed: { matches: 3, won: 1, drew: 1, lost: 1 },
      led: { matches: 2, won: 1, drew: 0, lost: 1 },
      missing: 1,
      known: 6,
    });
  });

  it("never counts more matches than the standings page played", async () => {
    mockStoredMatches(halfTimeSeason);
    const comebacks = await getTeamComebacks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);
    mockStoredMatches(halfTimeSeason);
    const standings = await getStandings({
      competitionCode: COMPETITION_CODE,
      seasonId: PAST_SEASON,
      activeSeasonId: ACTIVE_SEASON,
    });
    const played =
      standings.status === "ok"
        ? standings.standings.find((team) => team.teamProviderId === 1)?.played
        : 0;
    if (comebacks.status !== "ok") throw new Error("expected comebacks");

    expect(comebacks.known + comebacks.missing).toBe(played);
    // Strictly fewer, because one match was level at the break.
    expect(comebacks.trailed.matches + comebacks.led.matches).toBeLessThan(comebacks.known);
    expect(comebacks.trailed.won + comebacks.trailed.drew).toBeLessThanOrEqual(
      comebacks.trailed.matches
    );
    expect(comebacks.led.drew + comebacks.led.lost).toBeLessThanOrEqual(comebacks.led.matches);
  });

  it("counts only finished matches", async () => {
    mockStoredMatches([
      ...halfTimeSeason,
      {
        ...withHalfTime(playedOn(7, 2, 5, 0), [0, 2]),
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
      },
    ]);

    expect(await getTeamComebacks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      trailed: { matches: 3, won: 1, drew: 1, lost: 1 },
      led: { matches: 2, won: 1, drew: 0, lost: 1 },
      missing: 1,
      known: 6,
    });
  });

  it("reads the season once and asks no provider", async () => {
    mockStoredMatches(halfTimeSeason);

    await getTeamComebacks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("knows nothing for a season stored before the half-time columns existed", async () => {
    mockStoredMatches(season);

    expect(await getTeamComebacks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      trailed: NO_DIRECTION,
      led: NO_DIRECTION,
      missing: 6,
      known: 0,
    });
  });

  it("has no comebacks for a season with nothing stored yet", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    expect(await getTeamComebacks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "ok",
      trailed: NO_DIRECTION,
      led: NO_DIRECTION,
      missing: 0,
      known: 0,
    });
  });

  it("reports an error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider down"));

    expect(await getTeamComebacks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
  });

  it("reports an error, and logs it, when the season cannot be read at all", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(await getTeamComebacks(COMPETITION_CODE, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "error",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ competitionCode: COMPETITION_CODE, teamProviderId: 1 }),
      "Unable to compute the comebacks"
    );
  });
});
