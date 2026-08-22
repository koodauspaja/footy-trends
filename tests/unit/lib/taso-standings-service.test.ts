import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedTasoMatch } from "@/lib/taso";
import {
  getSeasonMatchList,
  getSeasonStandings,
  getTeamMatches,
  listSelectableTasoRounds,
  needsRefresh,
  parseTasoRoundParam,
  synchronizeMatches,
} from "@/lib/taso-standings-service";

const {
  dbMock,
  getCachedMock,
  getSeasonMatchesMock,
  getSeasonGroupsMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), insert: vi.fn() },
  getCachedMock: vi.fn(),
  getSeasonMatchesMock: vi.fn(),
  getSeasonGroupsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/lib/cache", () => ({ getCached: getCachedMock }));
vi.mock("@/lib/taso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso")>();
  return {
    ...actual,
    getSeasonMatches: getSeasonMatchesMock,
    getSeasonGroups: getSeasonGroupsMock,
  };
});
vi.mock("@/lib/logger", () => ({ logger: { warn: loggerWarnMock, error: loggerErrorMock } }));

const COMPETITION_ID = "spljp25";
const ACTIVE_SEASON = 2025;
const PAST_SEASON = 2024;

/**
 * `updatedAt` isn't part of `NormalizedTasoMatch` (it's DB-row-only), but
 * every test here passes these fixtures through `mockStoredMatches`, which
 * simulates a DB row — and `needsRefresh` needs a real `updatedAt` to avoid
 * always treating the fixture as "nothing stored yet".
 */
function match(
  overrides: Partial<NormalizedTasoMatch> & { updatedAt?: Date } = {}
): NormalizedTasoMatch & { updatedAt: Date } {
  return {
    providerMatchId: 1,
    competitionCode: COMPETITION_ID,
    seasonId: PAST_SEASON,
    groupId: 1,
    groupName: "Runkosarja",
    status: "FINISHED",
    kickoffAt: new Date("2025-04-01T14:00:00Z"),
    matchday: 1,
    homeTeamProviderId: 1,
    homeTeamName: "HJK",
    awayTeamProviderId: 2,
    awayTeamName: "KuPS",
    homeGoals: 2,
    awayGoals: 1,
    // Fresh, not stale — a mockStoredMatches-based test is about the
    // matches themselves, not needsRefresh's staleness threshold (covered
    // separately below), so this should never trigger an unmocked refetch.
    updatedAt: new Date(),
    ...overrides,
  };
}

function storedAt(msAgo: number) {
  return { updatedAt: new Date(Date.now() - msAgo) };
}

function mockStoredMatches(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValue({ from });
}

function mockInsert() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  dbMock.insert.mockReturnValue({ values });
  return { values, onConflictDoUpdate };
}

const CURRENT_SEASON_CACHE_TTL_MS = 15 * 60 * 1000;

describe("needsRefresh", () => {
  it("refreshes when nothing is stored for the season", () => {
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, [])).toBe(true);
  });

  it("never refreshes a past season that has stored matches, however stale", () => {
    expect(needsRefresh(PAST_SEASON, ACTIVE_SEASON, [storedAt(0)])).toBe(false);
    expect(
      needsRefresh(PAST_SEASON, ACTIVE_SEASON, [storedAt(CURRENT_SEASON_CACHE_TTL_MS * 24)])
    ).toBe(false);
  });

  it("keeps fresh current-season data without refreshing", () => {
    expect(needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, [storedAt(0)])).toBe(false);
    expect(
      needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, [storedAt(CURRENT_SEASON_CACHE_TTL_MS / 2)])
    ).toBe(false);
  });

  it("refreshes the current season once the 15-minute threshold has elapsed", () => {
    expect(
      needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, [storedAt(CURRENT_SEASON_CACHE_TTL_MS)])
    ).toBe(true);
    expect(
      needsRefresh(ACTIVE_SEASON, ACTIVE_SEASON, [storedAt(CURRENT_SEASON_CACHE_TTL_MS * 2)])
    ).toBe(true);
  });
});

describe("getSeasonStandings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("own-calculates the origin group (group_id=1) directly from its own matches", async () => {
    mockStoredMatches([
      match({ providerMatchId: 1, homeTeamProviderId: 1, awayTeamProviderId: 2 }),
      match({
        providerMatchId: 2,
        homeTeamProviderId: 2,
        awayTeamProviderId: 1,
        homeGoals: 0,
        awayGoals: 0,
      }),
    ]);

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.groups).toEqual([
      expect.objectContaining({ kind: "own-calculated", groupId: 1, groupName: "Runkosarja" }),
    ]);
  });

  it("own-calculates a configured carry-over group by combining it with its parent's matches", async () => {
    mockStoredMatches([
      match({ providerMatchId: 1, groupId: 1, homeTeamProviderId: 1, awayTeamProviderId: 2 }),
      match({
        providerMatchId: 2,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        homeTeamProviderId: 1,
        awayTeamProviderId: 2,
        homeGoals: 3,
        awayGoals: 0,
      }),
    ]);

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    expect(result.status).toBe("ok");
    const mestaruussarja =
      result.status === "ok" && result.groups.find((group) => group.groupId === 2);
    expect(mestaruussarja).toMatchObject({ kind: "own-calculated", groupName: "Mestaruussarja" });
    const hjk =
      mestaruussarja &&
      mestaruussarja.kind === "own-calculated" &&
      mestaruussarja.standings.find((team) => team.teamName === "HJK");
    // Combines both the parent (Runkosarja) match and the child's own match.
    expect(hjk).toMatchObject({ played: 2, points: 6, goalsFor: 5 });
  });

  it("lists only the continuation group's own teams, not every parent-group team, renumbered from 1", async () => {
    // Mirrors a real season's shape: 4 teams in Runkosarja, of which only 2
    // go on to Mestaruussarja. The other 2 must not leak into its table —
    // and crucially, the 2 that continue keep the points they earned in
    // Runkosarja *against* the teams that didn't.
    mockStoredMatches([
      match({
        providerMatchId: 1,
        groupId: 1,
        matchday: 1,
        homeTeamProviderId: 1,
        homeTeamName: "HJK",
        awayTeamProviderId: 3,
        awayTeamName: "Relegated A",
        homeGoals: 1,
        awayGoals: 0,
      }),
      match({
        providerMatchId: 2,
        groupId: 1,
        matchday: 1,
        homeTeamProviderId: 2,
        homeTeamName: "KuPS",
        awayTeamProviderId: 4,
        awayTeamName: "Relegated B",
        homeGoals: 2,
        awayGoals: 0,
      }),
      match({
        providerMatchId: 3,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        homeTeamProviderId: 2,
        homeTeamName: "KuPS",
        awayTeamProviderId: 1,
        awayTeamName: "HJK",
        homeGoals: 1,
        awayGoals: 0,
      }),
    ]);

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    const mestaruussarja =
      result.status === "ok" ? result.groups.find((group) => group.groupId === 2) : undefined;
    const standings =
      mestaruussarja?.kind === "own-calculated" ? mestaruussarja.standings : undefined;

    expect(standings?.map((team) => team.teamName)).toEqual(["KuPS", "HJK"]);
    // Positions are relative to this group (1-2), not carried over from the
    // combined table — matching TASO's own final_group_standing.
    expect(standings?.map((team) => team.position)).toEqual([1, 2]);
    // KuPS: 3pts beating Relegated B in Runkosarja + 3 beating HJK = 6.
    expect(standings?.[0]).toMatchObject({ teamName: "KuPS", points: 6, played: 2 });
    expect(standings?.[1]).toMatchObject({ teamName: "HJK", points: 3, played: 2 });
  });

  it("leaves the origin group's own table untouched, since it has no parent to filter against", async () => {
    mockStoredMatches([
      match({
        providerMatchId: 1,
        groupId: 1,
        homeTeamProviderId: 1,
        homeTeamName: "HJK",
        awayTeamProviderId: 3,
        awayTeamName: "Relegated A",
      }),
      match({
        providerMatchId: 2,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        homeTeamProviderId: 1,
        awayTeamProviderId: 3,
      }),
    ]);

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    const runkosarja =
      result.status === "ok" ? result.groups.find((group) => group.groupId === 1) : undefined;
    const standings = runkosarja?.kind === "own-calculated" ? runkosarja.standings : undefined;
    expect(standings?.map((team) => team.teamName).sort()).toEqual(["HJK", "Relegated A"]);
  });

  it("filters an own-calculated group's standings by round, spanning both parent and child rounds", async () => {
    mockStoredMatches([
      match({
        providerMatchId: 1,
        groupId: 1,
        matchday: 1,
        homeTeamProviderId: 1,
        awayTeamProviderId: 2,
      }),
      match({
        providerMatchId: 2,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        homeTeamProviderId: 1,
        awayTeamProviderId: 2,
        homeGoals: 3,
        awayGoals: 0,
      }),
    ]);

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, 1);

    const mestaruussarja =
      result.status === "ok" && result.groups.find((group) => group.groupId === 2);
    const hjk =
      mestaruussarja &&
      mestaruussarja.kind === "own-calculated" &&
      mestaruussarja.standings.find((team) => team.teamName === "HJK");
    // Round 1 only includes the parent's match; the child's round-23 match is excluded.
    expect(hjk).toMatchObject({ played: 1, points: 3 });
  });

  it("shows an origin-group winless team as a zero-stats row via the roster-seeding pass-through", async () => {
    mockStoredMatches([
      match({ providerMatchId: 1, homeTeamProviderId: 1, awayTeamProviderId: 2 }),
      match({
        providerMatchId: 2,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        matchday: 2,
        homeTeamProviderId: 3,
        homeTeamName: "IFK Mariehamn",
        awayTeamProviderId: 1,
      }),
    ]);

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    const origin = result.status === "ok" && result.groups[0];
    const mariehamn =
      origin &&
      origin.kind === "own-calculated" &&
      origin.standings.find((team) => team.teamName === "IFK Mariehamn");
    expect(mariehamn).toMatchObject({ played: 0, points: 0 });
  });

  it("renders an unconfigured non-origin group with some real points via pass-through", async () => {
    mockStoredMatches([
      match({ providerMatchId: 1, groupId: 1 }),
      match({
        providerMatchId: 2,
        groupId: 4,
        groupName: "Eurolopputurnaus",
        matchday: null,
        homeGoals: 1,
        awayGoals: 0,
      }),
    ]);
    getSeasonGroupsMock.mockResolvedValue([
      {
        group_id: "4",
        group_name: "Eurolopputurnaus",
        teams: [
          { team_id: "1", team_name: "HJK", points: null, matches_played: null },
          // Missing team_id/team_name entirely, and a group TASO doesn't
          // return standings for (no matching group_id) — both defensive,
          // shouldn't-happen-in-practice cases the mapper must not crash on.
          { goals_for: 3, goals_against: 1, goals_diff: 2, points: 9 },
          // Explicit null (as opposed to simply absent) and a real
          // final_group_standing value used as the position fallback when
          // current_standing itself is absent.
          { team_id: "2", team_name: "KuPS", final_group_standing: null },
          { team_id: "3", team_name: "Ilves", final_group_standing: "5" },
        ],
      },
    ]);
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    const result = await getSeasonStandings(
      COMPETITION_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(result.status).toBe("ok");
    const eurolopputurnaus =
      result.status === "ok" ? result.groups.find((group) => group.groupId === 4) : undefined;
    expect(eurolopputurnaus).toMatchObject({ kind: "pass-through", groupName: "Eurolopputurnaus" });
    const standings = eurolopputurnaus?.kind === "pass-through" ? eurolopputurnaus.standings : [];
    expect(standings[0]).toMatchObject({ points: null, played: null });
    expect(standings[1]).toMatchObject({
      teamProviderId: 0,
      teamName: "",
      points: 9,
      goalsFor: 3,
      goalsAgainst: 1,
      goalDifference: 2,
    });
    expect(standings[2]).toMatchObject({ teamName: "KuPS", position: 3 });
    expect(standings[3]).toMatchObject({ teamName: "Ilves", position: 5 });
  });

  it("renders an empty pass-through table when TASO's getGroups has no entry for the group at all", async () => {
    mockStoredMatches([
      match({ providerMatchId: 1, groupId: 1 }),
      match({ providerMatchId: 2, groupId: 4, groupName: "Eurolopputurnaus", matchday: null }),
    ]);
    getSeasonGroupsMock.mockResolvedValue([]);
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    const eurolopputurnaus =
      result.status === "ok" ? result.groups.find((group) => group.groupId === 4) : undefined;
    expect(eurolopputurnaus).toMatchObject({ kind: "pass-through", standings: [] });
  });

  it("classifies a group whose every team has null points as playoff, rendering its matches", async () => {
    mockStoredMatches([
      match({ providerMatchId: 1, groupId: 1 }),
      match({
        providerMatchId: 3,
        groupId: 4,
        groupName: "Eurolopputurnaus",
        matchday: 2,
        kickoffAt: new Date("2024-10-28T15:00:00Z"),
        homeTeamName: "FC Honka",
        awayTeamName: "AC Oulu",
      }),
      match({
        providerMatchId: 2,
        groupId: 4,
        groupName: "Eurolopputurnaus",
        matchday: 1,
        kickoffAt: new Date("2024-10-25T15:00:00Z"),
        homeTeamName: "FC Honka",
        awayTeamName: "FC Inter",
      }),
    ]);
    // A real Eurolopputurnaus entry: one row per bracket slot, so the
    // advancing team repeats — and points are null for every row.
    getSeasonGroupsMock.mockResolvedValue([
      {
        group_id: "4",
        group_name: "Eurolopputurnaus",
        teams: [
          // TASO omits `points` entirely on these rows rather than sending
          // null — an `=== null` check matches nothing, so the real shape
          // (absent) is the one asserted here. The null variant is kept on
          // the last row so both paths stay covered.
          { team_id: "1", team_name: "FC Honka", matches_played: 5 },
          { team_id: "1", team_name: "FC Honka", matches_played: 0 },
          { team_id: "2", team_name: "AC Oulu", points: null, matches_played: 2 },
        ],
      },
    ]);
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    const playoff =
      result.status === "ok" ? result.groups.find((group) => group.groupId === 4) : undefined;
    expect(playoff).toMatchObject({ kind: "playoff", groupName: "Eurolopputurnaus" });
    // Chronological, not stored order — the group has no table to sort.
    const matches = playoff?.kind === "playoff" ? playoff.matches : [];
    expect(matches.map((entry) => entry.providerMatchId)).toEqual([2, 3]);
  });

  it("keeps a league group with real points as a table even when it is not own-calculated", async () => {
    // 2019's Mestaruussarja: a genuine league group with carry-over points,
    // but no CARRY_OVER_CONFIG entry, so it is not own-calculated. It must
    // not be mistaken for a playoff group — the reason the playoff rule is
    // a positive test on the data rather than "everything we can't
    // calculate". See specs/010-playoff-group-match-list.md.
    mockStoredMatches([
      match({ providerMatchId: 1, groupId: 1 }),
      match({ providerMatchId: 2, groupId: 2, groupName: "Mestaruussarja", matchday: 23 }),
    ]);
    getSeasonGroupsMock.mockResolvedValue([
      {
        group_id: "2",
        group_name: "Mestaruussarja",
        teams: [
          { team_id: "1", team_name: "KuPS", points: 53, matches_played: 27 },
          { team_id: "2", team_name: "FC Inter", points: 48, matches_played: 27 },
        ],
      },
    ]);
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());

    const result = await getSeasonStandings("spljp19", 2019, ACTIVE_SEASON, undefined);

    const mestaruussarja =
      result.status === "ok" ? result.groups.find((group) => group.groupId === 2) : undefined;
    expect(mestaruussarja).toMatchObject({ kind: "pass-through" });
    const standings = mestaruussarja?.kind === "pass-through" ? mestaruussarja.standings : [];
    expect(standings[0]).toMatchObject({ teamName: "KuPS", points: 53 });
  });

  it("orders groups by group_id ascending regardless of insertion order", async () => {
    mockStoredMatches([
      match({ providerMatchId: 1, groupId: 3, groupName: "Karsintasarja", matchday: 23 }),
      match({ providerMatchId: 2, groupId: 1, groupName: "Runkosarja" }),
      match({ providerMatchId: 3, groupId: 2, groupName: "Mestaruussarja", matchday: 23 }),
    ]);

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    expect(result.status === "ok" && result.groups.map((group) => group.groupId)).toEqual([
      1, 2, 3,
    ]);
  });

  it("reports empty when the season has no matches at all", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getSeasonStandings(
      COMPETITION_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(result).toEqual({ status: "empty", groups: [] });
  });

  it("falls back to stored matches when a refresh fails but stored data exists", async () => {
    mockStoredMatches([match({ updatedAt: new Date(0) })]);
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO unavailable"));

    const result = await getSeasonStandings(
      COMPETITION_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(result.status).toBe("ok");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "TASO refresh failed; using stored matches"
    );
  });

  it("returns an error when a refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO unavailable"));

    const result = await getSeasonStandings(
      COMPETITION_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(result).toEqual({ status: "error", groups: [] });
  });

  it("returns an error when the database query itself fails", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getSeasonStandings(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

    expect(result).toEqual({ status: "error", groups: [] });
  });
});

describe("getSeasonMatchList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every match across groups, sorted by kickoff", async () => {
    mockStoredMatches([
      match({ providerMatchId: 2, kickoffAt: new Date("2025-04-08T14:00:00Z") }),
      match({ providerMatchId: 1, kickoffAt: new Date("2025-04-01T14:00:00Z") }),
    ]);

    const result = await getSeasonMatchList(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON);

    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([1, 2]);
  });

  it("reports empty when the season truly has no matches", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getSeasonMatchList(COMPETITION_ID, ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "empty" });
  });

  it("reports error when a refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO unavailable"));

    const result = await getSeasonMatchList(COMPETITION_ID, ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
  });

  it("reports error when the database query itself fails", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getSeasonMatchList(COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Unable to load TASO season matches"
    );
  });
});

describe("getTeamMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a team's matches across every group it appears in, chronologically", async () => {
    mockStoredMatches([
      match({ providerMatchId: 2, groupId: 2, matchday: 23, kickoffAt: new Date("2025-06-01") }),
      match({ providerMatchId: 1, groupId: 1, kickoffAt: new Date("2025-04-01") }),
    ]);

    const result = await getTeamMatches(COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([1, 2]);
  });

  it("reports not_found when the team never appears in the season", async () => {
    mockStoredMatches([match({ homeTeamProviderId: 9, awayTeamProviderId: 8 })]);

    const result = await getTeamMatches(COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "not_found" });
  });

  it("reports error when the database query itself fails", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getTeamMatches(COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), teamProviderId: 1 }),
      "Unable to load TASO team matches"
    );
  });

  it("reports empty when the season truly has no matches", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getTeamMatches(COMPETITION_ID, 1, ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "empty" });
  });

  it("reports error when a refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO unavailable"));

    const result = await getTeamMatches(COMPETITION_ID, 1, ACTIVE_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "error" });
  });
});

describe("listSelectableTasoRounds", () => {
  it("lists only own-calculated groups' rounds, continuing the season's real numbering", () => {
    const matches = [
      match({ providerMatchId: 1, groupId: 1, matchday: 1 }),
      match({ providerMatchId: 2, groupId: 1, matchday: 2 }),
      match({ providerMatchId: 3, groupId: 2, groupName: "Mestaruussarja", matchday: 23 }),
      match({ providerMatchId: 4, groupId: 4, groupName: "Eurolopputurnaus", matchday: 40 }),
    ];

    expect(listSelectableTasoRounds(matches, COMPETITION_ID)).toEqual([1, 2, 23]);
  });
});

describe("parseTasoRoundParam", () => {
  const availableRounds = [1, 2, 23, 24];

  it("treats an absent or empty value as absent", () => {
    expect(parseTasoRoundParam(undefined, availableRounds)).toEqual({ kind: "absent" });
    expect(parseTasoRoundParam("", availableRounds)).toEqual({ kind: "absent" });
  });

  it("accepts a round present in the available list", () => {
    expect(parseTasoRoundParam("23", availableRounds)).toEqual({ kind: "valid", round: 23 });
  });

  it("rejects a round not present in the list, even inside its numeric range", () => {
    // 3 is between 2 and 23 but was never an actual round_id for this season.
    expect(parseTasoRoundParam("3", availableRounds)).toEqual({ kind: "invalid" });
  });

  it("rejects a non-numeric or array value", () => {
    expect(parseTasoRoundParam("not-a-round", availableRounds)).toEqual({ kind: "invalid" });
    expect(parseTasoRoundParam(["23"], availableRounds)).toEqual({ kind: "invalid" });
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

    await synchronizeMatches([match()]);

    expect(dbMock.insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith([expect.objectContaining({ updatedAt: expect.any(Date) })]);
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.anything() })
    );
  });
});
