import { beforeEach, describe, expect, it, vi } from "vitest";
import { tasoGroupTeams } from "@/db/schema";
import type { NormalizedTasoMatch } from "@/lib/taso";
import {
  getSeasonCategoryName,
  getSeasonMatchList,
  getSeasonStandings,
  getTeamMatches,
  listSeasonRounds,
  listSelectableTasoRounds,
  needsRefresh,
  parseTasoRoundParam,
  resolveTasoSeasonContext,
  synchronizeGroupTeams,
  synchronizeMatches,
} from "@/lib/taso-standings-service";

const {
  dbMock,
  getCachedMock,
  getSeasonMatchesMock,
  getSeasonGroupsMock,
  getSeasonCategoryNamesMock,
  getCurrentSeasonMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), insert: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
  getCachedMock: vi.fn(),
  getSeasonMatchesMock: vi.fn(),
  getSeasonGroupsMock: vi.fn(),
  getSeasonCategoryNamesMock: vi.fn(),
  getCurrentSeasonMock: vi.fn(),
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
    getSeasonCategoryNames: getSeasonCategoryNamesMock,
    getCurrentSeason: getCurrentSeasonMock,
  };
});
vi.mock("@/lib/logger", () => ({ logger: { warn: loggerWarnMock, error: loggerErrorMock } }));

const COMPETITION_ID = "spljp25";
const CATEGORY_ID = "VL";
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
    categoryId: CATEGORY_ID,
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

/**
 * A team row as `taso_group_teams` stores it. Points default to whatever the
 * matches produce, because most tests only care that TASO agrees — a test
 * about disagreement passes `points` explicitly.
 */
function groupTeam(overrides: Partial<typeof tasoGroupTeams.$inferSelect> = {}) {
  return {
    categoryId: CATEGORY_ID,
    competitionCode: COMPETITION_ID,
    seasonId: PAST_SEASON,
    groupId: 1,
    teamProviderId: 1,
    teamName: "HJK",
    startingPoints: 0,
    points: 0,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    currentStanding: 1,
    finalGroupStanding: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * The service reads two tables now, so the mock dispatches on which one.
 * `groupTeams` defaults to empty, which is the "TASO groups unavailable"
 * path — own-calculated with no adjustment, and no comparison to fall back on.
 */
function mockStoredMatches(rows: unknown[], groupTeams: unknown[] = []) {
  const from = vi.fn().mockImplementation((table: unknown) => {
    const rowsForTable = table === tasoGroupTeams ? groupTeams : rows;
    const orderBy = vi.fn().mockResolvedValue(rowsForTable);
    return { where: vi.fn().mockReturnValue({ orderBy }) };
  });
  dbMock.select.mockReturnValue({ from });
}

function mockInsert() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  dbMock.insert.mockReturnValue({ values });

  // Group standings are replaced as a snapshot inside a transaction, so the
  // mock has to hand the callback something delete-and-insert shaped.
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  dbMock.delete.mockReturnValue({ where: deleteWhere });
  dbMock.transaction.mockImplementation(
    async (run: (tx: typeof dbMock) => Promise<unknown>) => await run(dbMock)
  );

  return { values, onConflictDoUpdate, deleteWhere };
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

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

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

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

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

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

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

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

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

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      1
    );

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

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const origin = result.status === "ok" && result.groups[0];
    const mariehamn =
      origin &&
      origin.kind === "own-calculated" &&
      origin.standings.find((team) => team.teamName === "IFK Mariehamn");
    expect(mariehamn).toMatchObject({ played: 0, points: 0 });
  });

  it("renders TASO's own numbers, not ours, when the two disagree", async () => {
    // The replacement for spec 009's shape heuristic: a group we cannot
    // reproduce is identified by result, not by its group_id.
    mockStoredMatches(
      [match({ providerMatchId: 1, groupId: 1, homeGoals: 2, awayGoals: 1 })],
      [
        // TASO says HJK has 9 points; the single stored match gives it 3.
        groupTeam({ teamProviderId: 1, teamName: "HJK", points: 9, played: 3, currentStanding: 1 }),
        groupTeam({
          teamProviderId: 2,
          teamName: "KuPS",
          points: 0,
          played: 3,
          currentStanding: 2,
        }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const group = result.status === "ok" ? result.groups[0] : undefined;
    expect(group?.kind).toBe("pass-through");
    const standings = group?.kind === "pass-through" ? group.standings : [];
    expect(standings.map((team) => [team.teamName, team.points])).toEqual([
      ["HJK", 9],
      ["KuPS", 0],
    ]);
  });

  it("renders a group TASO lists with no teams as a match list", async () => {
    // An unplayed qualifying match: the group exists with zero team rows.
    // Three of these exist in 2026.
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1 }),
        match({ providerMatchId: 2, groupId: 2, groupName: "Karsintaottelu", matchday: 1 }),
      ],
      [
        groupTeam({ groupId: 1, teamProviderId: 1, points: 3 }),
        groupTeam({ groupId: 1, teamProviderId: 2, points: 0 }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const group = result.status === "ok" ? result.groups.find((g) => g.groupId === 2) : undefined;
    expect(group?.kind).toBe("match-list");
    expect(group?.kind === "match-list" && group.matches).toHaveLength(1);
  });

  it("renders a knockout group as a match list, since it keeps no points at all", async () => {
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1 }),
        match({ providerMatchId: 2, groupId: 4, groupName: "Eurolopputurnaus", matchday: null }),
      ],
      [
        groupTeam({ groupId: 1, teamProviderId: 1, points: 3 }),
        groupTeam({ groupId: 1, teamProviderId: 2, points: 0 }),
        // TASO omits points entirely for a bracket — not zero, absent.
        groupTeam({ groupId: 4, teamProviderId: 1, points: null }),
        groupTeam({ groupId: 4, teamProviderId: 2, points: null }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const group = result.status === "ok" ? result.groups.find((g) => g.groupId === 4) : undefined;
    expect(group?.kind).toBe("match-list");
  });

  it("subtracts a points deduction carried in starting_points", async () => {
    // Veikkausliiga 2016's PK-35 Vantaa, in miniature: TASO's published points
    // are the calculated total minus 6, and the app showed the wrong one until
    // this was applied. See specs/013-more-finnish-competitions.md.
    mockStoredMatches(
      [match({ providerMatchId: 1, groupId: 1, homeGoals: 2, awayGoals: 1 })],
      [
        groupTeam({ teamProviderId: 1, teamName: "HJK", startingPoints: -6, points: -3 }),
        groupTeam({ teamProviderId: 2, teamName: "KuPS", startingPoints: 0, points: 0 }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const group = result.status === "ok" ? result.groups[0] : undefined;
    expect(group?.kind).toBe("own-calculated");
    const standings = group?.kind === "own-calculated" ? group.standings : [];
    // 3 for the win, minus the 6-point deduction.
    expect(standings.find((team) => team.teamName === "HJK")?.points).toBe(-3);
  });

  it("adds a qualifying bonus and re-sorts the table around it", async () => {
    // Junior SM series bring 1-3 points from their qualifying series, which is
    // a different category entirely — there are no matches to derive it from.
    mockStoredMatches(
      [match({ providerMatchId: 1, groupId: 1, homeGoals: 0, awayGoals: 0 })],
      [
        groupTeam({ teamProviderId: 1, teamName: "HJK", startingPoints: 0, points: 1 }),
        groupTeam({ teamProviderId: 2, teamName: "KuPS", startingPoints: 3, points: 4 }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const group = result.status === "ok" ? result.groups[0] : undefined;
    expect(group?.kind).toBe("own-calculated");
    const standings = group?.kind === "own-calculated" ? group.standings : [];
    // The draw leaves both on 1; the bonus puts KuPS top, so the adjustment
    // has to reorder the table rather than only change a number.
    expect(standings.map((team) => [team.position, team.teamName, team.points])).toEqual([
      [1, "KuPS", 4],
      [2, "HJK", 1],
    ]);
  });

  it("does not double-count a seeded carry-over group's starting_points", async () => {
    // 2015-2024's convention: TASO seeds the child with the parent's points
    // and counts only the child's own matches. We already fold the parent's
    // matches in, so adding starting_points again would double them.
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1, homeGoals: 3, awayGoals: 0 }),
        match({
          providerMatchId: 2,
          groupId: 2,
          groupName: "Mestaruussarja",
          matchday: 23,
          homeGoals: 1,
          awayGoals: 0,
        }),
      ],
      [
        groupTeam({ groupId: 1, teamProviderId: 1, teamName: "HJK", points: 3 }),
        groupTeam({ groupId: 1, teamProviderId: 2, teamName: "KuPS", points: 0 }),
        // starting_points is HJK's 3 Runkosarja points, plus 3 for its
        // Mestaruussarja win = 6 published.
        groupTeam({ groupId: 2, teamProviderId: 1, teamName: "HJK", startingPoints: 3, points: 6 }),
        groupTeam({
          groupId: 2,
          teamProviderId: 2,
          teamName: "KuPS",
          startingPoints: 0,
          points: 0,
        }),
      ]
    );

    const result = await getSeasonStandings(CATEGORY_ID, "spljp22", 2022, ACTIVE_SEASON, undefined);

    const group = result.status === "ok" ? result.groups.find((g) => g.groupId === 2) : undefined;
    expect(group?.kind).toBe("own-calculated");
    const standings = group?.kind === "own-calculated" ? group.standings : [];
    // 6, not 9 — the parent's 3 counted once.
    expect(standings.find((team) => team.teamName === "HJK")?.points).toBe(6);
  });

  it("scopes starting_points to the group being calculated, not the whole season", async () => {
    // Adjustments are keyed by team, so a team that plays in both a parent and
    // a child group has a row in each — with different starting_points. Feed
    // the season's rows in unscoped and the last one wins, handing Runkosarja
    // the Mestaruussarja seed and breaking its reconciliation.
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1, homeGoals: 3, awayGoals: 0 }),
        match({
          providerMatchId: 2,
          groupId: 2,
          groupName: "Mestaruussarja",
          matchday: 23,
          homeGoals: 1,
          awayGoals: 0,
        }),
      ],
      [
        groupTeam({ groupId: 1, teamProviderId: 1, teamName: "HJK", startingPoints: 0, points: 3 }),
        groupTeam({
          groupId: 1,
          teamProviderId: 2,
          teamName: "KuPS",
          startingPoints: 0,
          points: 0,
        }),
        // The same team, a different group, a different starting_points.
        groupTeam({ groupId: 2, teamProviderId: 1, teamName: "HJK", startingPoints: 3, points: 6 }),
        groupTeam({
          groupId: 2,
          teamProviderId: 2,
          teamName: "KuPS",
          startingPoints: 0,
          points: 0,
        }),
      ]
    );

    const result = await getSeasonStandings(CATEGORY_ID, "spljp22", 2022, ACTIVE_SEASON, undefined);
    const groups = result.status === "ok" ? result.groups : [];

    const runkosarja = groups.find((group) => group.groupId === 1);
    const mestaruussarja = groups.find((group) => group.groupId === 2);

    // Runkosarja keeps its own 3 — it must not pick up Mestaruussarja's seed,
    // which would make it 6 and force the whole group to fall back.
    expect(runkosarja?.kind).toBe("own-calculated");
    expect(
      runkosarja?.kind === "own-calculated"
        ? runkosarja.standings.find((team) => team.teamName === "HJK")?.points
        : undefined
    ).toBe(3);

    expect(mestaruussarja?.kind).toBe("own-calculated");
    expect(
      mestaruussarja?.kind === "own-calculated"
        ? mestaruussarja.standings.find((team) => team.teamName === "HJK")?.points
        : undefined
    ).toBe(6);
  });

  it("own-calculates without adjustments when TASO's groups are unavailable", async () => {
    // A cold store plus an unreachable getGroups must not turn every group
    // into a match list, nor render an empty table.
    mockStoredMatches([match({ providerMatchId: 1, groupId: 1 })], []);
    getSeasonGroupsMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const group = result.status === "ok" ? result.groups[0] : undefined;
    expect(group?.kind).toBe("own-calculated");
    expect(group?.kind === "own-calculated" && group.standings).toHaveLength(2);
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  it("leaves a group with no round filtering alone when a round is selected", async () => {
    // Only an own-calculated group responds to a round; a match-list group
    // must come through the round path unchanged rather than being rebuilt.
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1, matchday: 1 }),
        match({ providerMatchId: 2, groupId: 4, groupName: "Eurolopputurnaus", matchday: 1 }),
      ],
      [
        groupTeam({ groupId: 1, teamProviderId: 1, teamName: "HJK", points: 3 }),
        groupTeam({ groupId: 1, teamProviderId: 2, teamName: "KuPS", points: 0 }),
        groupTeam({ groupId: 4, teamProviderId: 1, points: null }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      1
    );
    const groups = result.status === "ok" ? result.groups : [];

    expect(groups.find((group) => group.groupId === 1)?.kind).toBe("own-calculated");
    const knockout = groups.find((group) => group.groupId === 4);
    expect(knockout?.kind).toBe("match-list");
    expect(knockout?.kind === "match-list" && knockout.matches).toHaveLength(1);
  });

  it("orders groups by group_id ascending regardless of insertion order", async () => {
    mockStoredMatches([
      match({ providerMatchId: 1, groupId: 3, groupName: "Karsintasarja", matchday: 23 }),
      match({ providerMatchId: 2, groupId: 1, groupName: "Runkosarja" }),
      match({ providerMatchId: 3, groupId: 2, groupName: "Mestaruussarja", matchday: 23 }),
    ]);

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(result.status === "ok" && result.groups.map((group) => group.groupId)).toEqual([
      1, 2, 3,
    ]);
  });

  it("reports empty when the season has no matches at all", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getSeasonStandings(
      CATEGORY_ID,
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
      CATEGORY_ID,
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
      CATEGORY_ID,
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

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

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

    const result = await getSeasonMatchList(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON
    );

    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([1, 2]);
  });

  it("reports empty when the season truly has no matches", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    const result = await getSeasonMatchList(
      CATEGORY_ID,
      COMPETITION_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON
    );

    expect(result).toEqual({ status: "empty" });
  });

  it("reports error when a refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO unavailable"));

    const result = await getSeasonMatchList(
      CATEGORY_ID,
      COMPETITION_ID,
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

    const result = await getSeasonMatchList(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON
    );

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

    const result = await getTeamMatches(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([1, 2]);
  });

  it("reports not_found when the team never appears in the season", async () => {
    mockStoredMatches([match({ homeTeamProviderId: 9, awayTeamProviderId: 8 })]);

    const result = await getTeamMatches(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON);

    expect(result).toEqual({ status: "not_found" });
  });

  it("reports error when the database query itself fails", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("connection refused"));
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await getTeamMatches(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON);

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

    const result = await getTeamMatches(
      CATEGORY_ID,
      COMPETITION_ID,
      1,
      ACTIVE_SEASON,
      ACTIVE_SEASON
    );

    expect(result).toEqual({ status: "empty" });
  });

  it("reports error when a refresh fails and nothing is stored", async () => {
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO unavailable"));

    const result = await getTeamMatches(
      CATEGORY_ID,
      COMPETITION_ID,
      1,
      ACTIVE_SEASON,
      ACTIVE_SEASON
    );

    expect(result).toEqual({ status: "error" });
  });
});

describe("listSelectableTasoRounds", () => {
  it("lists only the rounds of groups that have a table, continuing the season's real numbering", () => {
    const matches = [
      match({ providerMatchId: 1, groupId: 1, matchday: 1 }),
      match({ providerMatchId: 2, groupId: 1, matchday: 2 }),
      match({ providerMatchId: 3, groupId: 2, groupName: "Mestaruussarja", matchday: 23 }),
      match({ providerMatchId: 4, groupId: 4, groupName: "Eurolopputurnaus", matchday: 40 }),
    ];

    expect(listSelectableTasoRounds(matches, new Set([1, 2]))).toEqual([1, 2, 23]);
  });

  it("excludes a knockout group's round 0, which would filter nothing", () => {
    // Veikkausliiga 2022's Eurolopputurnausfinaali really does number from 0.
    const matches = [
      match({ providerMatchId: 1, groupId: 1, matchday: 1 }),
      match({ providerMatchId: 2, groupId: 5, groupName: "Eurolopputurnausfinaali", matchday: 0 }),
    ];

    expect(listSelectableTasoRounds(matches, new Set([1]))).toEqual([1]);
    // …and keeps it when that group does have a table, so the exclusion is
    // driven by the group, not by the number.
    expect(listSelectableTasoRounds(matches, new Set([1, 5]))).toEqual([0, 1]);
  });
});

describe("standings edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("breaks a points tie on goal difference, then goals scored, then name", async () => {
    // An adjustment can move a team, so the table is re-sorted afterwards —
    // on the same keys calculateStandings uses, or the two would disagree.
    mockStoredMatches(
      [
        match({
          providerMatchId: 1,
          homeTeamProviderId: 1,
          homeTeamName: "AAA",
          awayTeamProviderId: 2,
          awayTeamName: "Loser1",
          homeGoals: 3,
          awayGoals: 0,
        }),
        match({
          providerMatchId: 2,
          homeTeamProviderId: 3,
          homeTeamName: "ZZZ",
          awayTeamProviderId: 4,
          awayTeamName: "Loser2",
          homeGoals: 1,
          awayGoals: 0,
        }),
        match({
          providerMatchId: 3,
          homeTeamProviderId: 5,
          homeTeamName: "BBB",
          awayTeamProviderId: 6,
          awayTeamName: "Loser3",
          homeGoals: 1,
          awayGoals: 0,
        }),
      ],
      [
        groupTeam({ teamProviderId: 1, teamName: "AAA", points: 3 }),
        groupTeam({ teamProviderId: 3, teamName: "ZZZ", points: 3 }),
        groupTeam({ teamProviderId: 5, teamName: "BBB", points: 3 }),
        groupTeam({ teamProviderId: 2, teamName: "Loser1", points: 0 }),
        groupTeam({ teamProviderId: 4, teamName: "Loser2", points: 0 }),
        groupTeam({ teamProviderId: 6, teamName: "Loser3", points: 0 }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );
    const standings =
      result.status === "ok" && result.groups[0]?.kind === "own-calculated"
        ? result.groups[0].standings
        : [];

    // AAA first on goal difference (+3). ZZZ and BBB both +1 and 1 scored, so
    // the name breaks it: BBB before ZZZ.
    expect(standings.slice(0, 3).map((team) => team.teamName)).toEqual(["AAA", "BBB", "ZZZ"]);
  });

  it("treats a missing starting_points as no adjustment", async () => {
    mockStoredMatches(
      [match({ providerMatchId: 1, homeGoals: 2, awayGoals: 1 })],
      [
        groupTeam({ teamProviderId: 1, teamName: "HJK", startingPoints: null, points: 3 }),
        groupTeam({ teamProviderId: 2, teamName: "KuPS", startingPoints: null, points: 0 }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(
      result.status === "ok" && result.groups[0]?.kind === "own-calculated"
        ? result.groups[0].standings[0]?.points
        : undefined
    ).toBe(3);
  });

  it("falls back when our table omits a team TASO ranks", async () => {
    // Comparing only the teams we produced would call this a match: every team
    // we listed agreed, because the one that disagreed was not there to check.
    // A team with no stored matches at all is exactly that case.
    mockStoredMatches(
      [match({ providerMatchId: 1, homeGoals: 2, awayGoals: 1 })],
      [
        groupTeam({ teamProviderId: 1, teamName: "HJK", points: 3 }),
        groupTeam({ teamProviderId: 2, teamName: "KuPS", points: 0 }),
        // TASO ranks a third team we have no matches for, so it cannot appear
        // in our table — rendering ours would silently drop it.
        groupTeam({ teamProviderId: 3, teamName: "Ilves", points: 0, currentStanding: 3 }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );
    const group = result.status === "ok" ? result.groups[0] : undefined;

    expect(group?.kind).toBe("pass-through");
    expect(group?.kind === "pass-through" && group.standings.map((team) => team.teamName)).toEqual([
      "HJK",
      "KuPS",
      "Ilves",
    ]);
  });

  it("keeps a table when TASO reports points for only some of its teams", async () => {
    // A row without points is not a disagreement — rosters and results can be
    // briefly out of step mid-season.
    mockStoredMatches(
      [match({ providerMatchId: 1, homeGoals: 2, awayGoals: 1 })],
      [
        groupTeam({ teamProviderId: 1, teamName: "HJK", points: 3 }),
        groupTeam({ teamProviderId: 2, teamName: "KuPS", points: null }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(result.status === "ok" && result.groups[0]?.kind).toBe("own-calculated");
  });

  it("still filters an own-calculated group by round when TASO's numbers agree", async () => {
    mockStoredMatches(
      [
        match({ providerMatchId: 1, matchday: 1, homeGoals: 2, awayGoals: 1 }),
        match({
          providerMatchId: 2,
          matchday: 2,
          homeTeamProviderId: 2,
          awayTeamProviderId: 1,
          homeGoals: 1,
          awayGoals: 0,
        }),
      ],
      [
        groupTeam({ teamProviderId: 1, teamName: "HJK", points: 3 }),
        groupTeam({ teamProviderId: 2, teamName: "KuPS", points: 3 }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      1
    );
    const standings =
      result.status === "ok" && result.groups[0]?.kind === "own-calculated"
        ? result.groups[0].standings
        : [];

    // Round 1 only: HJK has its win, KuPS has not played its own yet.
    expect(standings.map((team) => [team.teamName, team.played])).toEqual([
      ["HJK", 1],
      ["KuPS", 1],
    ]);
  });

  it("orders a fallback table by TASO's own standing, falling back through to input order", async () => {
    mockStoredMatches(
      [match({ providerMatchId: 1, homeGoals: 2, awayGoals: 1 })],
      [
        // Disagrees with the single stored match, so this group falls back.
        // Ordered so the comparator meets an unranked row on both sides.
        groupTeam({
          teamProviderId: 2,
          teamName: "First",
          points: 98,
          currentStanding: 1,
          finalGroupStanding: null,
        }),
        groupTeam({
          teamProviderId: 3,
          teamName: "Unranked",
          points: 97,
          currentStanding: null,
          finalGroupStanding: null,
        }),
        groupTeam({
          teamProviderId: 1,
          teamName: "Third",
          points: 99,
          currentStanding: null,
          finalGroupStanding: 3,
        }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );
    const group = result.status === "ok" ? result.groups[0] : undefined;
    expect(group?.kind).toBe("pass-through");
    const standings = group?.kind === "pass-through" ? group.standings : [];

    // current_standing wins; final_group_standing is the fallback; a team with
    // neither sorts as 0 and keeps its position from the row order.
    // Ranked rows in TASO's order, the unranked one last — not sorted to the
    // top on a 0 and numbered 1 alongside the actual leader.
    expect(standings.map((team) => [team.teamName, team.position])).toEqual([
      ["First", 1],
      ["Third", 2],
      ["Unranked", 3],
    ]);
  });

  it("gives every fallback row a distinct position even when TASO's numbering has gaps", async () => {
    // Copying `current_standing` verbatim produced duplicates here.
    mockStoredMatches(
      [match({ providerMatchId: 1, homeGoals: 2, awayGoals: 1 })],
      [
        groupTeam({ teamProviderId: 1, teamName: "A", points: 99, currentStanding: 1 }),
        groupTeam({ teamProviderId: 2, teamName: "B", points: 98, currentStanding: 5 }),
        groupTeam({ teamProviderId: 3, teamName: "C", points: 97, currentStanding: null }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );
    const group = result.status === "ok" ? result.groups[0] : undefined;
    const positions =
      group?.kind === "pass-through" ? group.standings.map((team) => team.position) : [];

    expect(positions).toEqual([1, 2, 3]);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("lists a match-list group's matches chronologically, whatever order they are stored in", async () => {
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1 }),
        match({
          providerMatchId: 2,
          groupId: 4,
          groupName: "Eurolopputurnaus",
          kickoffAt: new Date("2025-09-01T15:00:00Z"),
        }),
        match({
          providerMatchId: 3,
          groupId: 4,
          groupName: "Eurolopputurnaus",
          kickoffAt: new Date("2025-08-01T15:00:00Z"),
        }),
      ],
      [
        groupTeam({ groupId: 1, teamProviderId: 1, points: 3 }),
        groupTeam({ groupId: 4, teamProviderId: 1, points: null }),
      ]
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );
    const group = result.status === "ok" ? result.groups.find((g) => g.groupId === 4) : undefined;

    expect(group?.kind === "match-list" && group.matches.map((m) => m.providerMatchId)).toEqual([
      3, 2,
    ]);
  });
});

describe("group standings storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the season even when TASO returns no group rows", async () => {
    // "This season has no group standings" is an answer, not a non-answer:
    // keeping the previous rows would leave every dropped team in place. A
    // failed request is the case that preserves what is stored.
    const insert = mockInsert();

    await synchronizeGroupTeams(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, []);

    expect(insert.values).not.toHaveBeenCalled();
    expect(dbMock.delete).toHaveBeenCalled();
  });

  it("upserts group rows on the group-and-team identity", async () => {
    const insert = mockInsert();

    await synchronizeGroupTeams(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, [
      {
        categoryId: "VL",
        competitionCode: COMPETITION_ID,
        seasonId: PAST_SEASON,
        groupId: 1,
        teamProviderId: 1,
        teamName: "HJK",
        startingPoints: -2,
        points: 10,
        played: 4,
        won: 3,
        drawn: 1,
        lost: 0,
        goalsFor: 8,
        goalsAgainst: 2,
        goalDifference: 6,
        currentStanding: 1,
        finalGroupStanding: null,
      },
    ]);

    expect(insert.values).toHaveBeenCalledWith([
      expect.objectContaining({
        teamProviderId: 1,
        startingPoints: -2,
        updatedAt: expect.any(Date),
      }),
    ]);
    // Replaced as a snapshot, not merged: a team TASO has dropped must not
    // survive the refresh carrying an obsolete starting_points.
    expect(dbMock.delete).toHaveBeenCalled();
    expect(dbMock.transaction).toHaveBeenCalled();
  });

  it("clears the season's existing rows before writing the new snapshot", async () => {
    const insert = mockInsert();
    const order: string[] = [];
    dbMock.delete.mockImplementation(() => {
      order.push("delete");
      return { where: vi.fn().mockResolvedValue(undefined) };
    });
    insert.values.mockImplementation(() => {
      order.push("insert");
      return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
    });

    await synchronizeGroupTeams(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, [
      {
        categoryId: CATEGORY_ID,
        competitionCode: COMPETITION_ID,
        seasonId: PAST_SEASON,
        groupId: 1,
        teamProviderId: 1,
        teamName: "HJK",
        startingPoints: 0,
        points: 3,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        goalsFor: 2,
        goalsAgainst: 1,
        goalDifference: 1,
        currentStanding: 1,
        finalGroupStanding: null,
      },
    ]);

    expect(order).toEqual(["delete", "insert"]);
  });

  it("collapses a knockout group's repeated bracket slots to one row per team", async () => {
    // Postgres rejects an ON CONFLICT DO UPDATE that touches the same row
    // twice, and a team that advances occupies several slots — which cost
    // Veikkausliiga 2019 and 2022 their whole stored group standings before
    // this. Caught by a real database, not by a mocked insert.
    const insert = mockInsert();
    const slot = (teamProviderId: number) => ({
      categoryId: "VL",
      competitionCode: COMPETITION_ID,
      seasonId: PAST_SEASON,
      groupId: 5,
      teamProviderId,
      teamName: "HJK",
      startingPoints: null,
      points: null,
      played: null,
      won: null,
      drawn: null,
      lost: null,
      goalsFor: null,
      goalsAgainst: null,
      goalDifference: null,
      currentStanding: null,
      finalGroupStanding: null,
    });

    await synchronizeGroupTeams(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, [
      slot(1),
      slot(2),
      slot(1),
    ]);

    const values = insert.values.mock.calls[0]?.[0] as { teamProviderId: number }[];
    expect(values.map((row) => row.teamProviderId)).toEqual([1, 2]);
  });

  it("refreshes stale group standings from TASO and stores them", async () => {
    mockStoredMatches([match({ seasonId: ACTIVE_SEASON })], []);
    mockInsert();
    getSeasonGroupsMock.mockResolvedValue([
      { group_id: "1", group_name: "Runkosarja", teams: [{ team_id: "1", points: 3 }] },
    ]);

    await getSeasonStandings(CATEGORY_ID, COMPETITION_ID, ACTIVE_SEASON, ACTIVE_SEASON, undefined);

    expect(getSeasonGroupsMock).toHaveBeenCalledWith(COMPETITION_ID, CATEGORY_ID);
  });

  it("keeps serving stored group standings when the refresh fails", async () => {
    // The reason these are stored rather than only cached: losing them would
    // silently drop every starting_points adjustment.
    mockStoredMatches(
      [match({ providerMatchId: 1, homeGoals: 2, awayGoals: 1 })],
      [
        groupTeam({ teamProviderId: 1, teamName: "HJK", startingPoints: -6, points: -3 }),
        groupTeam({ teamProviderId: 2, teamName: "KuPS", points: 0 }),
      ]
    );
    getSeasonGroupsMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const group = result.status === "ok" ? result.groups[0] : undefined;
    expect(group?.kind === "own-calculated" && group.standings[1]?.points).toBe(-3);
  });
});

describe("getSeasonCategoryName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the name the competition carried that season", async () => {
    getCachedMock.mockResolvedValue({ NL: "Naisten Liiga", VL: "Veikkausliiga" });

    await expect(getSeasonCategoryName("NL", "spljp16", 2016, 2026)).resolves.toBe("Naisten Liiga");
  });

  it("returns null for a category the season does not list", async () => {
    getCachedMock.mockResolvedValue({ VL: "Veikkausliiga" });

    await expect(getSeasonCategoryName("M1L", "spljp16", 2016, 2026)).resolves.toBeNull();
  });

  it("returns null rather than failing the page when TASO cannot be asked", async () => {
    // A name is presentation: the caller falls back to the configured one.
    getCachedMock.mockRejectedValue(new Error("provider unavailable"));

    await expect(getSeasonCategoryName("VL", "spljp26", 2026, 2026)).resolves.toBeNull();
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  it("fetches the season's categories once behind the cache", async () => {
    // The cache key is the season, not the category: one call covers all 28,
    // so asking for a second competition in the same season is free.
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());
    getSeasonCategoryNamesMock.mockResolvedValue({ NL: "Naisten Liiga" });

    await expect(getSeasonCategoryName("NL", "spljp16", 2016, 2026)).resolves.toBe("Naisten Liiga");
    expect(getSeasonCategoryNamesMock).toHaveBeenCalledWith("spljp16");
  });

  it("caches a completed season's names for a year and the current season's briefly", async () => {
    getCachedMock.mockResolvedValue({});

    await getSeasonCategoryName("VL", "spljp20", 2020, 2026);
    expect(getCachedMock).toHaveBeenCalledWith(
      "taso:categories:spljp20",
      60 * 60 * 24 * 365,
      expect.any(Function)
    );

    await getSeasonCategoryName("VL", "spljp26", 2026, 2026);
    expect(getCachedMock).toHaveBeenCalledWith(
      "taso:categories:spljp26",
      15 * 60,
      expect.any(Function)
    );
  });
});

describe("listSeasonRounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers the rounds of groups that have a table, and not those of one that has none", async () => {
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1, matchday: 1 }),
        match({ providerMatchId: 2, groupId: 1, matchday: 2 }),
        match({ providerMatchId: 3, groupId: 4, groupName: "Eurolopputurnaus", matchday: 40 }),
      ],
      [
        // Must agree with the two stored wins, or group 1 falls back and stops
        // responding to a round at all.
        groupTeam({ groupId: 1, teamProviderId: 1, teamName: "HJK", points: 6 }),
        groupTeam({ groupId: 1, teamProviderId: 2, teamName: "KuPS", points: 0 }),
        groupTeam({ groupId: 4, teamProviderId: 1, points: null }),
      ]
    );

    await expect(
      listSeasonRounds(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON)
    ).resolves.toEqual([1, 2]);
  });

  it("offers no rounds for a season with no matches", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    await expect(
      listSeasonRounds(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON)
    ).resolves.toEqual([]);
  });

  it("does not offer a fallback group's rounds, which would change nothing", async () => {
    // A pass-through group shows TASO's final numbers whatever round is
    // picked, so its rounds in the selector are entries that visibly do
    // nothing.
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1, matchday: 1 }),
        match({ providerMatchId: 2, groupId: 2, groupName: "Jatkosarja", matchday: 30 }),
      ],
      [
        groupTeam({ groupId: 1, teamProviderId: 1, teamName: "HJK", points: 3 }),
        groupTeam({ groupId: 1, teamProviderId: 2, teamName: "KuPS", points: 0 }),
        // Disagrees with the stored match, so group 2 falls back.
        groupTeam({ groupId: 2, teamProviderId: 1, teamName: "HJK", points: 99 }),
        groupTeam({ groupId: 2, teamProviderId: 2, teamName: "KuPS", points: 98 }),
      ]
    );

    await expect(
      listSeasonRounds(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON)
    ).resolves.toEqual([1]);
  });

  it("offers every group's rounds when TASO's groups are unknown", async () => {
    // Degraded, not broken: without group data every group still renders a
    // table, so every group's rounds are selectable.
    mockStoredMatches(
      [
        match({ providerMatchId: 1, groupId: 1, matchday: 1 }),
        match({ providerMatchId: 2, groupId: 2, matchday: 23 }),
      ],
      []
    );
    getSeasonGroupsMock.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      listSeasonRounds(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON)
    ).resolves.toEqual([1, 23]);
  });

  it("offers no rounds rather than failing the page when the query throws", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database unavailable");
    });

    await expect(
      listSeasonRounds(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON)
    ).resolves.toEqual([]);
    expect(loggerWarnMock).toHaveBeenCalled();
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

describe("resolveTasoSeasonContext", () => {
  /** `max(season_id)` for the newest-stored fallback, then the season's own rows. */
  function mockDb(newestStored: number | null, seasonMatches: unknown[]) {
    dbMock.select.mockImplementation((fields?: Record<string, unknown>) => {
      if (fields !== undefined && "seasonId" in fields) {
        // Scoped to the competition now, so the aggregate has a where clause.
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ seasonId: newestStored }]),
          }),
        };
      }
      const orderBy = vi.fn().mockResolvedValue(seasonMatches);
      const where = vi.fn().mockReturnValue({ orderBy });
      return { from: vi.fn().mockReturnValue({ where }) };
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());
  });

  it("uses the discovered season when it already has matches", async () => {
    getCurrentSeasonMock.mockResolvedValue(2027);
    mockDb(2027, [match({ seasonId: 2027 })]);

    await expect(resolveTasoSeasonContext("VL")).resolves.toEqual({
      currentSeason: 2027,
      defaultSeason: 2027,
    });
  });

  it("keeps a published-but-empty season out of the default while still raising the ceiling", async () => {
    // TASO publishes a competition_id before the season kicks off. Landing
    // there would render the empty state, so the default lags — but the
    // season is still selectable.
    getCurrentSeasonMock.mockResolvedValue(2027);
    mockDb(2026, []);
    getSeasonMatchesMock.mockResolvedValue([]);

    await expect(resolveTasoSeasonContext("VL")).resolves.toEqual({
      currentSeason: 2027,
      defaultSeason: 2026,
    });
  });

  it("does make an all-fixtures season the default — unplayed is not empty", async () => {
    getCurrentSeasonMock.mockResolvedValue(2027);
    mockDb(2026, []);
    getSeasonMatchesMock.mockResolvedValue([
      match({ seasonId: 2027, status: "SCHEDULED", homeGoals: null, awayGoals: null }),
    ]);
    mockInsert();

    await expect(resolveTasoSeasonContext("VL")).resolves.toMatchObject({ defaultSeason: 2027 });
  });

  it("falls back to the newest stored season when discovery fails", async () => {
    getCurrentSeasonMock.mockRejectedValue(new Error("TASO down"));
    mockDb(2025, [match({ seasonId: 2025 })]);

    await expect(resolveTasoSeasonContext("VL")).resolves.toEqual({
      currentSeason: 2025,
      defaultSeason: 2025,
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "TASO season discovery failed; falling back to stored seasons"
    );
  });

  it("falls back to the newest stored season when discovery recognizes nothing", async () => {
    getCurrentSeasonMock.mockResolvedValue(null);
    mockDb(2024, [match({ seasonId: 2024 })]);

    await expect(resolveTasoSeasonContext("VL")).resolves.toMatchObject({ currentSeason: 2024 });
  });

  it("falls back to the configured floor when discovery fails and nothing is stored", async () => {
    getCurrentSeasonMock.mockRejectedValue(new Error("TASO down"));
    mockDb(null, []);
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO down"));

    await expect(resolveTasoSeasonContext("VL")).resolves.toEqual({
      currentSeason: 2015,
      defaultSeason: 2015,
    });
  });

  it("never defaults above the ceiling, even if a stored season outlives its publication", async () => {
    // TASO stops reporting 2027 after we synced it. The ceiling follows
    // discovery down by design, so the default must come down with it —
    // otherwise the page lands on a season its own selector does not list.
    getCurrentSeasonMock.mockResolvedValue(2026);
    mockDb(2027, []);
    getSeasonMatchesMock.mockResolvedValue([]);

    await expect(resolveTasoSeasonContext("VL")).resolves.toEqual({
      currentSeason: 2026,
      defaultSeason: 2026,
    });
  });

  it("still resolves when the matches check itself throws", async () => {
    getCurrentSeasonMock.mockResolvedValue(2027);
    dbMock.select.mockImplementation((fields?: Record<string, unknown>) => {
      if (fields !== undefined && "seasonId" in fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ seasonId: 2026 }]),
          }),
        };
      }
      throw new Error("database unavailable");
    });

    await expect(resolveTasoSeasonContext("VL")).resolves.toEqual({
      currentSeason: 2027,
      defaultSeason: 2026,
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentSeason: 2027 }),
      "Unable to check the current season for matches"
    );
  });
});
