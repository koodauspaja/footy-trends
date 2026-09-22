import { beforeEach, describe, expect, it, vi } from "vitest";
import { tasoGroupTeams } from "@/db/schema";
import { calculateStandings, type NormalizedMatch } from "@/lib/standings";
import type { NormalizedTasoMatch } from "@/lib/taso";
import {
  getSeasonCategoryName,
  getSeasonCategoryNameMap,
  getSeasonMatchList,
  getSeasonStandings,
  getTeamCleanSheetSeries,
  getTeamComebacks,
  getTeamFormSeries,
  getTeamGoalsSeries,
  getTeamHomeAwaySeries,
  getTeamMatches,
  getTeamPositionSeries,
  getTeamSeasonComparison,
  getTeamStreaks,
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
  dbMock: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
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
    halfTimeHome: null,
    halfTimeAway: null,
    winner: null,
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
        halfTimeHome: null,
        halfTimeAway: null,
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
        halfTimeHome: null,
        halfTimeAway: null,
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
        halfTimeHome: null,
        halfTimeAway: null,
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
        halfTimeHome: null,
        halfTimeAway: null,
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
        halfTimeHome: null,
        halfTimeAway: null,
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
        halfTimeHome: null,
        halfTimeAway: null,
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
        halfTimeHome: null,
        halfTimeAway: null,
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

  it("renders a cup's rounds as match lists even when TASO reports points for them", async () => {
    /**
     * The regression #272 introduced without anyone seeing it. TASO's
     * `getGroups` omitted points for a knockout, so a cup round classified as a
     * match list by accident of the data; `getCategory`, which the app moved to
     * when TASO started refusing `getGroups`, sends points for those rounds.
     *
     * Every round of Suomen Cup then rendered as a league table, which also
     * removed the bracket — it is built from the groups that render as matches —
     * and put a `Kierros` selector on a page with no rounds to filter.
     */
    mockStoredMatches(
      [match({ providerMatchId: 1, groupId: 1, groupName: "Neljäs kierros", matchday: null })],
      [
        groupTeam({ groupId: 1, teamProviderId: 1, points: 3 }),
        groupTeam({ groupId: 1, teamProviderId: 2, points: 0 }),
      ]
    );

    const result = await getSeasonStandings(
      // MSC is Miesten Suomen Cup, whose format is "cup" in the registry.
      "MSC",
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    const group = result.status === "ok" ? result.groups.find((g) => g.groupId === 1) : undefined;
    expect(group?.kind).toBe("match-list");
  });

  it("still gives a league group its table when points are reported", async () => {
    // The other side of the same rule: the cup check must not swallow leagues,
    // which is the failure mode of fixing this in `keepsATable` instead.
    mockStoredMatches(
      [match({ providerMatchId: 1, groupId: 1 })],
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

    const group = result.status === "ok" ? result.groups.find((g) => g.groupId === 1) : undefined;
    expect(group?.kind).not.toBe("match-list");
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
          halfTimeHome: null,
          halfTimeAway: null,
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
          halfTimeHome: null,
          halfTimeAway: null,
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

    // Nothing stored to fall back to, so this is an error rather than a
    // warning: every table in the group would otherwise render as zeros, which
    // reads as a result rather than a failure. That is how a refused endpoint
    // stayed invisible for months (#272).
    // Logged at error, with the stored count: zero rows means every table in
    // the group renders as zeros, which reads as a result rather than a
    // failure. That is how a refused endpoint stayed invisible (#272).
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ stored: 0 }),
      expect.stringContaining("falling back to stored group standings")
    );
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

  /**
   * The two cases above, but for the specific failure #363 introduced.
   *
   * A timeout arrives as an `AbortError` thrown from `fetch`, which takes the
   * same path as any other provider failure — so these pass by construction
   * rather than by new handling. They are here because "by construction" is an
   * argument, and the acceptance criterion asked for the behaviour to be
   * verified: a bound that produced an error page instead of stored data would
   * be worse than no bound at all.
   */
  it("falls back to stored matches when the refresh times out", async () => {
    mockStoredMatches([match({ updatedAt: new Date(0) })]);
    getSeasonMatchesMock.mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError")
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(result.status).toBe("ok");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(DOMException) }),
      "TASO refresh failed; using stored matches"
    );
  });

  it("reports an error when the refresh times out and nothing is stored", async () => {
    // The cold-database case: there is nothing to serve, and saying so is the
    // honest answer. A timeout must not be reported as "no matches".
    mockStoredMatches([]);
    getSeasonMatchesMock.mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError")
    );

    const result = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON,
      undefined
    );

    expect(result).toEqual({ status: "error", groups: [] });
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

  /**
   * The bar for an error is "nothing to serve", not "the refresh failed".
   * `/maajoukkueet/huuhkajat` depends on this: a failed refresh of a finished
   * season must not blank a page whose stored rows are already complete. See
   * specs/017-huuhkajat.md.
   */
  it("serves stored matches when the refresh fails, rather than reporting error", async () => {
    // `updatedAt: 0` makes the row stale, so a refresh is attempted at all.
    mockStoredMatches([match({ providerMatchId: 1, updatedAt: new Date(0) })]);
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO unavailable"));

    const result = await getSeasonMatchList(
      CATEGORY_ID,
      COMPETITION_ID,
      ACTIVE_SEASON,
      ACTIVE_SEASON
    );

    expect(result.status).toBe("ok");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "TASO refresh failed; using stored matches"
    );
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
          halfTimeHome: null,
          halfTimeAway: null,
        }),
        match({
          providerMatchId: 2,
          homeTeamProviderId: 3,
          homeTeamName: "ZZZ",
          awayTeamProviderId: 4,
          awayTeamName: "Loser2",
          homeGoals: 1,
          awayGoals: 0,
          halfTimeHome: null,
          halfTimeAway: null,
        }),
        match({
          providerMatchId: 3,
          homeTeamProviderId: 5,
          homeTeamName: "BBB",
          awayTeamProviderId: 6,
          awayTeamName: "Loser3",
          homeGoals: 1,
          awayGoals: 0,
          halfTimeHome: null,
          halfTimeAway: null,
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
          halfTimeHome: null,
          halfTimeAway: null,
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

  it("builds a carry-over table for the current season, from a full provider refresh", async () => {
    // The carry-over fixtures all run as completed seasons, which take the
    // stored path. A configured *current* season — Kakkonen, Kansallinen Liiga
    // and Kansallinen Ykkönen all have 2026 entries — refreshes both matches
    // and group standings from TASO first, and nothing covered that
    // combination.
    const synced = [
      groupTeam({ seasonId: 2022, groupId: 1, teamProviderId: 1, teamName: "HJK", points: 3 }),
      groupTeam({ seasonId: 2022, groupId: 1, teamProviderId: 2, teamName: "KuPS", points: 0 }),
      groupTeam({
        seasonId: 2022,
        groupId: 2,
        teamProviderId: 1,
        teamName: "HJK",
        startingPoints: 3,
        points: 6,
      }),
      groupTeam({
        seasonId: 2022,
        groupId: 2,
        teamProviderId: 2,
        teamName: "KuPS",
        startingPoints: 0,
        points: 0,
      }),
    ];

    // Nothing stored on the first read, so both syncs run; the second read is
    // what the freshly written snapshot looks like.
    let groupReads = 0;
    dbMock.select.mockReturnValue({
      from: vi.fn().mockImplementation((table: unknown) => {
        const rows = table === tasoGroupTeams && groupReads++ > 0 ? synced : [];
        return {
          where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(rows) }),
        };
      }),
    });
    mockInsert();

    getSeasonMatchesMock.mockResolvedValue([
      match({ providerMatchId: 1, seasonId: 2022, groupId: 1, homeGoals: 3, awayGoals: 0 }),
      match({
        providerMatchId: 2,
        seasonId: 2022,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        homeGoals: 1,
        awayGoals: 0,
        halfTimeHome: null,
        halfTimeAway: null,
      }),
    ]);
    getSeasonGroupsMock.mockResolvedValue([
      {
        group_id: "1",
        group_name: "Runkosarja",
        teams: [
          { team_id: "1", team_name: "HJK", points: 3 },
          { team_id: "2", team_name: "KuPS", points: 0 },
        ],
      },
      {
        group_id: "2",
        group_name: "Mestaruussarja",
        teams: [
          { team_id: "1", team_name: "HJK", points: 6, starting_points: 3 },
          { team_id: "2", team_name: "KuPS", points: 0, starting_points: 0 },
        ],
      },
    ]);

    const result = await getSeasonStandings(CATEGORY_ID, "spljp22", 2022, 2022, undefined);

    // Both halves of the season came from TASO, not from storage.
    expect(getSeasonMatchesMock).toHaveBeenCalledWith("spljp22", CATEGORY_ID, 2022);
    expect(getSeasonGroupsMock).toHaveBeenCalledWith("spljp22", CATEGORY_ID);

    const group = result.status === "ok" ? result.groups.find((g) => g.groupId === 2) : undefined;
    expect(group?.kind).toBe("own-calculated");
    // 6, not 3: the refreshed starting_points reconciled the carry-over.
    expect(
      group?.kind === "own-calculated"
        ? group.standings.find((team) => team.teamName === "HJK")?.points
        : undefined
    ).toBe(6);
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

describe("getSeasonCategoryNameMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every category name in the season", async () => {
    getCachedMock.mockResolvedValue({ WCQ: "MM-karsinnat Huuhkajat", NA: "Naisten A-maaottelut" });

    await expect(getSeasonCategoryNameMap("maajp2026", 2026, 2026)).resolves.toEqual({
      WCQ: "MM-karsinnat Huuhkajat",
      NA: "Naisten A-maaottelut",
    });
  });

  it("shares the per-season cache key with the single-name lookup", async () => {
    getCachedMock.mockResolvedValue({});

    await getSeasonCategoryNameMap("maajp18", 2021, 2026);

    expect(getCachedMock).toHaveBeenCalledWith(
      "taso:categories:maajp18",
      expect.any(Number),
      expect.any(Function)
    );
  });

  it("caches a past season for a year and the current one for fifteen minutes", async () => {
    getCachedMock.mockResolvedValue({});

    await getSeasonCategoryNameMap("maajp18", 2021, 2026);
    await getSeasonCategoryNameMap("maajp2026", 2026, 2026);

    expect(getCachedMock.mock.calls[0]?.[1]).toBe(60 * 60 * 24 * 365);
    expect(getCachedMock.mock.calls[1]?.[1]).toBe(15 * 60);
  });

  it("asks TASO for the season's categories on a cache miss", async () => {
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());
    getSeasonCategoryNamesMock.mockResolvedValue({ WCQ: "MM-karsinnat Huuhkajat" });

    await expect(getSeasonCategoryNameMap("maajp2026", 2026, 2026)).resolves.toEqual({
      WCQ: "MM-karsinnat Huuhkajat",
    });
    expect(getSeasonCategoryNamesMock).toHaveBeenCalledWith("maajp2026");
  });

  /**
   * Unlike `getSeasonCategoryName`, this one lets a failure through: its
   * caller discovers which competitions a season holds, so a swallowed error
   * would look like a season with none. See specs/017-huuhkajat.md.
   */
  it("propagates a failure rather than returning an empty map", async () => {
    getCachedMock.mockRejectedValue(new Error("provider unavailable"));

    await expect(getSeasonCategoryNameMap("maajp2026", 2026, 2026)).rejects.toThrow(
      "provider unavailable"
    );
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
    // `storedTasoSeasons` lists the seasons we hold, across both TASO tables,
    // and `newestStoredSeason` is the newest of them. One query shape rather
    // than a `max()` aggregate, so "what do we hold" has a single answer — see
    // specs/029-forced-season-refresh.md.
    dbMock.selectDistinct.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(newestStored === null ? [] : [{ seasonId: newestStored }]),
      }),
    }));
    dbMock.select.mockImplementation(() => {
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

  it("never puts a competition's ceiling below its own first season", async () => {
    // Ykkösliiga starts in 2024. With discovery down and nothing stored, an
    // unfloored ceiling of 2015 makes listSelectableTasoSeasons count down
    // from 2015 to 2024 — an empty selector, and a query for a season the
    // competition never had.
    getCurrentSeasonMock.mockRejectedValue(new Error("provider unavailable"));
    mockDb(null, []);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    await expect(resolveTasoSeasonContext("M1L")).resolves.toEqual({
      currentSeason: 2024,
      defaultSeason: 2024,
    });
  });

  it("never defaults to a stored season older than the competition itself", async () => {
    // Stale rows from before a competition's floor was configured must not
    // become its default, or the page lands on a season its own selector does
    // not offer.
    getCurrentSeasonMock.mockRejectedValue(new Error("provider unavailable"));
    mockDb(2023, []);
    getSeasonMatchesMock.mockResolvedValue([]);
    mockInsert();

    await expect(resolveTasoSeasonContext("M1L")).resolves.toEqual({
      currentSeason: 2024,
      defaultSeason: 2024,
    });
  });

  it("still resolves when the matches check itself throws", async () => {
    getCurrentSeasonMock.mockResolvedValue(2027);
    // The stored-season lookup answers; the probe's own read of the season's
    // matches is what fails.
    dbMock.selectDistinct.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ seasonId: 2026 }]),
      }),
    }));
    dbMock.select.mockImplementation(() => {
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

  describe("an unconfigured continuation group", () => {
    /**
     * The failure this exists to end: a hand-maintained config entry goes
     * missing, nothing errors, and the group quietly drops its parent round
     * and renders plausible numbers. Veikkausliiga and Ykkönen both reached
     * their 2026 splits that way (#272, #281).
     */
    const continuation = (groupId: string, overrides = {}) => ({
      group_id: groupId,
      group_name: "Mestaruussarja",
      group_type: "additional_group_stage",
      teams: [],
      ...overrides,
    });

    /**
     * A group with a team is the only shape that can reach storage, so the
     * tests about ids that are not ids use it. With `teams: []` they would
     * pass with every id check deleted, because an empty group contributes no
     * rows whatever its id.
     */
    const withTeam = (groupId: string) =>
      continuation(groupId, {
        teams: [{ team_id: "60731", team_name: "HJK", points: 12 }],
      });

    it("is reported, naming the group and TASO's own parent hint", async () => {
      mockStoredMatches([match({ providerMatchId: 1, groupId: 1 })], []);
      getSeasonGroupsMock.mockResolvedValue([
        { group_id: "1", group_name: "Runkosarja", group_type: "group_stage", teams: [] },
        continuation("9", { import_match_group_id: "1" }),
      ]);

      await getSeasonStandings(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 9, tasoParentHint: "1" }),
        expect.stringContaining("no carry-over entry")
      );
    });

    it("says nothing for a group that is configured", async () => {
      // VL group 2 in 2025 has an entry, so this must stay quiet — a detector
      // that fires on healthy data is noise nobody reads.
      mockStoredMatches([match({ providerMatchId: 1, groupId: 1 })], []);
      getSeasonGroupsMock.mockResolvedValue([continuation("2")]);

      await getSeasonStandings("VL", "spljp25", PAST_SEASON, ACTIVE_SEASON, undefined);

      expect(loggerErrorMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("no carry-over entry")
      );
    });

    it("is reported for a competition with no configuration at all", async () => {
      // The 2027 shape: a competition splits for the first time and nobody has
      // touched the config. There is no category key to look under, let alone a
      // season, and that must still be loud rather than absent.
      mockStoredMatches([match({ providerMatchId: 1, groupId: 1 })], []);
      getSeasonGroupsMock.mockResolvedValue([continuation("2")]);

      await getSeasonStandings("P18SM", "spljp27", PAST_SEASON, ACTIVE_SEASON, undefined);

      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "P18SM", groupId: 2 }),
        expect.stringContaining("no carry-over entry")
      );
    });

    it.each([
      ["will not parse", "not-a-number"],
      // `group_id` is optional in TASO's shape, so absent is as possible as
      // malformed, and both are the same non-answer.
      ["is missing entirely", undefined],
      // `Number.parseInt` would read this as 2 and attribute a malformed group
      // to a real one — suppressing the error, or raising it against the wrong
      // group.
      ["begins with digits but is not a number", "2abc"],
      ["is a decimal", "2.5"],
      // `Number` would read these as 0, which `Number.isInteger` accepts.
      ["is empty", ""],
      ["is whitespace", "  "],
      ["is negative", "-1"],
      // All digits, but not a group — the comment beside the check says a
      // group id is a positive integer, and this made it a liar.
      ["is zero", "0"],
      // Long enough that `Number` rounds it. Left unchecked this lands on a
      // real integer and can be attributed to a configured group.
      ["is beyond the safe integer range", "99999999999999999999"],
      // `Number` reads all four as positive integers, so the detector would
      // both report and store them — under a group that exists and is not the
      // one TASO named.
      ["is hexadecimal", "0x10"],
      ["is in exponent notation", "1e2"],
      ["carries a leading plus", "+2"],
      ["carries a leading space", " 2"],
    ])("neither reports nor stores a group whose id %s", async (_case, groupId) => {
      // Deliberately a competition with **no** configured groups. Under
      // `VL/spljp25`, where groups 2 and 3 are configured, `"2abc"` parses to 2
      // and is absorbed as "already configured" — the test would pass while the
      // malformed group was silently attributed to a real one.
      mockInsert();
      mockStoredMatches([match({ providerMatchId: 1, groupId: 1 })], []);
      getSeasonGroupsMock.mockResolvedValue([withTeam(groupId as string)]);

      await expect(
        getSeasonStandings("P18SM", "spljp27", PAST_SEASON, ACTIVE_SEASON, undefined)
      ).resolves.toBeDefined();

      expect(loggerErrorMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("no carry-over entry")
      );
      // Staying quiet is only half of it, and was all the first fix did
      // (#285). A group whose id is unusable must not reach the table either:
      // `"0"` would be stored as group 0, and an over-long id fails the insert
      // for the whole season's snapshot.
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it("stores a continuation whose id is real, so the check above can fail", async () => {
      // The positive control for the table above: same shape, same path, an id
      // that is an id. Without this, deleting every group from the pipeline
      // would leave that table green.
      const { values } = mockInsert();
      mockStoredMatches([match({ providerMatchId: 1, groupId: 1 })], []);
      getSeasonGroupsMock.mockResolvedValue([withTeam("9")]);

      await getSeasonStandings("P18SM", "spljp27", PAST_SEASON, ACTIVE_SEASON, undefined);

      expect(dbMock.insert).toHaveBeenCalledWith(tasoGroupTeams);
      expect(values).toHaveBeenCalledWith([
        expect.objectContaining({ groupId: 9, teamProviderId: 60731, points: 12 }),
      ]);
    });

    it.each([
      ["a first round", "group_stage"],
      ["a cup bracket", "knockout_final"],
    ])("says nothing for %s", async (_case, groupType) => {
      // TASO classifies these itself; only `additional_group_stage` carries an
      // earlier round forward.
      mockStoredMatches([match({ providerMatchId: 1, groupId: 1 })], []);
      getSeasonGroupsMock.mockResolvedValue([continuation("9", { group_type: groupType })]);

      await getSeasonStandings(CATEGORY_ID, COMPETITION_ID, PAST_SEASON, ACTIVE_SEASON, undefined);

      expect(loggerErrorMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("no carry-over entry")
      );
    });
  });
});

describe("getTeamPositionSeries", () => {
  /**
   * A league configured to split: groups 2 and 3 both continue group 1, unseeded
   * (`CARRY_OVER_CONFIG`). The fixtures use TASO's real category and season ids
   * because the carry-over rules are read from that configuration.
   */
  const LEAGUE = "M1";
  const SPLIT_SEASON = "spljp25";

  function game(
    competitionId: string,
    groupId: number,
    matchday: number,
    home: number,
    away: number,
    score: [number, number] | null
  ) {
    return match({
      providerMatchId: groupId * 1000 + matchday * 100 + home * 10 + away,
      categoryId: LEAGUE,
      competitionCode: competitionId,
      groupId,
      groupName: `Lohko ${groupId}`,
      matchday,
      homeTeamProviderId: home,
      homeTeamName: `Team ${home}`,
      awayTeamProviderId: away,
      awayTeamName: `Team ${away}`,
      status: score === null ? "SCHEDULED" : "FINISHED",
      homeGoals: score?.[0] ?? null,
      awayGoals: score?.[1] ?? null,
      halfTimeHome: null,
      halfTimeAway: null,
    });
  }

  /**
   * Group rows whose published points are **derived from `calculateStandings`**
   * over the group's own matches plus its parent's — what TASO publishes for a
   * carry-over group — rather than typed by hand. A row agreeing with our
   * calculation is what makes a group verified, and a hand calculation is the
   * easiest thing here to get wrong.
   */
  function rowsFor(
    matches: ReturnType<typeof game>[],
    competitionId: string,
    groupId: number,
    parentId: number | null
  ) {
    const own = matches.filter((row) => row.groupId === groupId);
    const contributing = matches.filter(
      (row) => row.groupId === groupId || (parentId !== null && row.groupId === parentId)
    );
    const teamIds = new Set(own.flatMap((row) => [row.homeTeamProviderId, row.awayTeamProviderId]));
    const finished = contributing.filter(
      (row) => row.status === "FINISHED"
    ) as unknown as NormalizedMatch[];

    return calculateStandings(finished, contributing)
      .filter((team) => teamIds.has(team.teamProviderId))
      .map((team) =>
        groupTeam({
          categoryId: LEAGUE,
          competitionCode: competitionId,
          groupId,
          teamProviderId: team.teamProviderId,
          teamName: team.teamName,
          points: team.points,
        })
      );
  }

  /**
   * Four teams play a regular season of three rounds, finishing 1, 2, 3, 4.
   * Then the league splits: {1, 2} above, {3, 4} below. TASO restarts the split
   * groups' rounds at 1, as it did in 2019, and `withContinuedRoundNumbering`
   * shifts them on to 4.
   */
  function splitSeason(
    competitionId: string,
    {
      regular = 1,
      upper = 2,
      lower = 3,
      teams: [a, b, c, d] = [1, 2, 3, 4],
    }: {
      regular?: number;
      upper?: number;
      lower?: number;
      teams?: [number, number, number, number];
    } = {}
  ) {
    return [
      game(competitionId, regular, 1, a, b, [2, 0]),
      game(competitionId, regular, 1, c, d, [1, 0]),
      game(competitionId, regular, 2, a, c, [1, 0]),
      game(competitionId, regular, 2, b, d, [1, 0]),
      game(competitionId, regular, 3, a, d, [1, 0]),
      game(competitionId, regular, 3, b, c, [1, 0]),
      game(competitionId, upper, 1, a, b, [0, 1]),
      game(competitionId, lower, 1, d, c, [2, 0]),
    ];
  }

  function verifiedRows(matches: ReturnType<typeof game>[], competitionId: string) {
    const groupIds = [...new Set(matches.map((row) => row.groupId))];
    return groupIds.flatMap((groupId) =>
      rowsFor(matches, competitionId, groupId, groupId === 1 ? null : 1)
    );
  }

  async function seriesFor(
    teamId: number,
    matches: ReturnType<typeof game>[],
    rows: unknown[],
    competitionId = SPLIT_SEASON
  ) {
    mockStoredMatches(matches, rows);
    return getTeamPositionSeries(LEAGUE, competitionId, teamId, PAST_SEASON, ACTIVE_SEASON);
  }

  it("plots the regular season and continues it in the combined table after the split", async () => {
    const matches = splitSeason(SPLIT_SEASON);

    expect(await seriesFor(4, matches, verifiedRows(matches, SPLIT_SEASON))).toEqual({
      status: "ok",
      points: [
        { round: 1, position: 3, played: true },
        { round: 2, position: 4, played: true },
        { round: 3, position: 4, played: true },
        // First in the lower group, below both teams of the upper one.
        { round: 4, position: 3, played: true },
      ],
      teamCount: 4,
      endsAtSplit: false,
    });
  });

  it("puts the lower group's leader directly below the whole upper group", async () => {
    /**
     * The rule Miikka described — the lower group's leader is 7th when the upper
     * group has six — at the size of this fixture: team 4 leads the lower group,
     * the upper group has two, so it is 3rd.
     */
    const matches = splitSeason(SPLIT_SEASON);
    const series = await seriesFor(4, matches, verifiedRows(matches, SPLIT_SEASON));
    const standings = await getSeasonStandings(LEAGUE, SPLIT_SEASON, PAST_SEASON, ACTIVE_SEASON, 4);
    const lowerGroup = standings.groups.find((group) => group.groupId === 3);
    const inGroup =
      lowerGroup?.kind === "own-calculated"
        ? lowerGroup.standings.find((team) => team.teamProviderId === 4)?.position
        : undefined;

    expect(inGroup).toBe(1);
    expect(series.status === "ok" && series.points.at(-1)).toEqual({
      round: 4,
      position: 1 + 2,
      played: true,
    });
  });

  it("equals the standings page's group table for every round, plus the groups above", async () => {
    /**
     * The property the feature rests on, checked against the real
     * `getSeasonStandings` — the function behind the standings page's round
     * selector — for every team, not against a restatement of it.
     */
    const matches = splitSeason(SPLIT_SEASON);
    const rows = verifiedRows(matches, SPLIT_SEASON);

    for (const teamId of [1, 2, 3, 4]) {
      const series = await seriesFor(teamId, matches, rows);
      if (series.status !== "ok") throw new Error(`expected a series for team ${teamId}`);

      for (const point of series.points) {
        mockStoredMatches(matches, rows);
        const standings = await getSeasonStandings(
          LEAGUE,
          SPLIT_SEASON,
          PAST_SEASON,
          ACTIVE_SEASON,
          point.round
        );
        const afterSplit = point.round > 3;
        const offset = afterSplit && (teamId === 3 || teamId === 4) ? 2 : 0;
        const table = standings.groups.find(
          (group) =>
            group.kind === "own-calculated" &&
            group.standings.some((team) => team.teamProviderId === teamId) &&
            (afterSplit ? group.groupId !== 1 : group.groupId === 1)
        );
        const row =
          table?.kind === "own-calculated"
            ? table.standings.find((team) => team.teamProviderId === teamId)
            : undefined;

        expect(point.position, `team ${teamId}, round ${point.round}`).toBe(
          (row?.position ?? Number.NaN) + offset
        );
      }
    }
  });

  it("ranks the split groups by the regular season, not by their group ids", async () => {
    // The lower teams in the lower-numbered group this time. Ranking by id would
    // put them on top.
    const matches = splitSeason(SPLIT_SEASON, { upper: 3, lower: 2 });
    const series = await seriesFor(4, matches, verifiedRows(matches, SPLIT_SEASON));

    expect(series.status === "ok" && series.points.at(-1)).toEqual({
      round: 4,
      position: 3,
      played: true,
    });
  });

  it("stops at the split, and says so, when the continuation does not reconcile", async () => {
    // The lower group's published points disagree with ours, so the standings
    // page shows TASO's numbers with no round selector — nothing per round to
    // equal.
    const matches = splitSeason(SPLIT_SEASON);
    const rows = verifiedRows(matches, SPLIT_SEASON).map((row) =>
      row.groupId === 3 ? { ...row, points: (row.points ?? 0) + 5 } : row
    );

    expect(await seriesFor(4, matches, rows)).toEqual({
      status: "ok",
      points: [
        { round: 1, position: 3, played: true },
        { round: 2, position: 4, played: true },
        { round: 3, position: 4, played: true },
      ],
      teamCount: 4,
      endsAtSplit: true,
    });
  });

  it("stops at the split when the season has no carry-over configured yet", async () => {
    // M1 has no 2020 entry: the live-season window before one is added and
    // verified looks like this, and so do old seasons nobody configured.
    const unconfigured = "spljp20";
    const matches = splitSeason(unconfigured);
    const series = await seriesFor(4, matches, verifiedRows(matches, unconfigured), unconfigured);

    expect(series.status === "ok" && series.endsAtSplit).toBe(true);
    expect(series.status === "ok" && series.points.map((point) => point.round)).toEqual([1, 2, 3]);
  });

  describe("a league played in parallel pools, each split in two (Kakkonen)", () => {
    /**
     * Kakkonen 2026, at this fixture's size: pools 1 and 2 play their own
     * regular seasons, then each splits into its own upper and lower
     * continuation — 4 and 7 from pool 1, 5 and 8 from pool 2, unseeded
     * (`CARRY_OVER_CONFIG`). A pool is its own league until the end of
     * jatkosarja; the promotion playoff after it is a bracket, with no line.
     */
    const KAKKONEN = "M2";
    const POOLS_SEASON = "spljp26";
    const PARENTS = new Map([
      [4, 1],
      [7, 1],
      [5, 2],
      [8, 2],
    ]);

    const matches = [
      ...splitSeason(POOLS_SEASON, { regular: 1, upper: 4, lower: 7 }),
      ...splitSeason(POOLS_SEASON, { regular: 2, upper: 5, lower: 8, teams: [11, 12, 13, 14] }),
    ].map((row) => ({ ...row, categoryId: KAKKONEN }));
    const rows = [1, 2, 4, 5, 7, 8].flatMap((groupId) =>
      rowsFor(matches, POOLS_SEASON, groupId, PARENTS.get(groupId) ?? null).map((row) => ({
        ...row,
        categoryId: KAKKONEN,
      }))
    );

    async function kakkonenSeries(teamId: number) {
      mockStoredMatches(matches, rows);
      return getTeamPositionSeries(KAKKONEN, POOLS_SEASON, teamId, PAST_SEASON, ACTIVE_SEASON);
    }

    it("continues through its pool's split, below only its own pool's upper group", async () => {
      // Team 4 leads pool 1's lower group. Two teams sit above it in pool 1's
      // upper group; pool 2's upper group is another league until the playoff.
      expect(await kakkonenSeries(4)).toEqual({
        status: "ok",
        points: [
          { round: 1, position: 3, played: true },
          { round: 2, position: 4, played: true },
          { round: 3, position: 4, played: true },
          { round: 4, position: 3, played: true },
        ],
        // The pool's four, not the competition's eight.
        teamCount: 4,
        endsAtSplit: false,
      });
    });

    it("places a team in the second pool by that pool alone", async () => {
      const series = await kakkonenSeries(14);

      expect(series.status === "ok" && series.teamCount).toBe(4);
      expect(series.status === "ok" && series.points.at(-1)).toEqual({
        round: 4,
        position: 3,
        played: true,
      });
    });

    it("equals the standings page's continuation table, plus its pool's upper group", async () => {
      // The continuations are verified, so the standings page has a round
      // selector for them — which is why the line must not stop here.
      mockStoredMatches(matches, rows);
      const standings = await getSeasonStandings(
        KAKKONEN,
        POOLS_SEASON,
        PAST_SEASON,
        ACTIVE_SEASON,
        4
      );
      const lowerGroup = standings.groups.find((group) => group.groupId === 8);
      const inGroup =
        lowerGroup?.kind === "own-calculated"
          ? lowerGroup.standings.find((team) => team.teamProviderId === 14)?.position
          : undefined;
      const series = await kakkonenSeries(14);

      expect(inGroup).toBe(1);
      expect(series.status === "ok" && series.points.at(-1)?.position).toBe((inGroup ?? 0) + 2);
    });
  });

  it("plots only the regular season when the split has happened but not been played", async () => {
    const matches = splitSeason(SPLIT_SEASON).map((row) =>
      row.groupId === 1 ? row : { ...row, status: "SCHEDULED", homeGoals: null, awayGoals: null }
    );

    expect(await seriesFor(4, matches, verifiedRows(matches, SPLIT_SEASON))).toEqual({
      status: "ok",
      points: [
        { round: 1, position: 3, played: true },
        { round: 2, position: 4, played: true },
        { round: 3, position: 4, played: true },
      ],
      teamCount: 4,
      endsAtSplit: false,
    });
  });

  it("stops at the split, with the note, when the continuation was played without rounds", async () => {
    // TASO can report a match with no round. The standings page cannot show such
    // a group per round, so the chart does not pretend to — and says so.
    const matches = splitSeason(SPLIT_SEASON).map((row) =>
      row.groupId === 3 ? { ...row, matchday: null } : row
    );

    expect(await seriesFor(4, matches, verifiedRows(matches, SPLIT_SEASON))).toEqual({
      status: "ok",
      points: [
        { round: 1, position: 3, played: true },
        { round: 2, position: 4, played: true },
        { round: 3, position: 4, played: true },
      ],
      teamCount: 4,
      endsAtSplit: true,
    });

    // Team 3 played that match away; a team is counted on either side.
    const awaySide = await seriesFor(3, matches, verifiedRows(matches, SPLIT_SEASON));
    expect(awaySide.status === "ok" && awaySide.endsAtSplit).toBe(true);
  });

  it("plots a league that never splits as one table", async () => {
    const matches = splitSeason(SPLIT_SEASON).filter((row) => row.groupId === 1);
    const series = await seriesFor(1, matches, verifiedRows(matches, SPLIT_SEASON));

    expect(series).toEqual({
      status: "ok",
      points: [
        { round: 1, position: 1, played: true },
        { round: 2, position: 1, played: true },
        { round: 3, position: 1, played: true },
      ],
      teamCount: 4,
      endsAtSplit: false,
    });
  });

  it("offers no chart when the regular season itself has no per-round table", async () => {
    // Published points that disagree with ours: the standings page shows TASO's
    // own numbers, with no round selector, for the whole season.
    const matches = splitSeason(SPLIT_SEASON).filter((row) => row.groupId === 1);
    const rows = verifiedRows(matches, SPLIT_SEASON).map((row) => ({
      ...row,
      points: (row.points ?? 0) + 1,
    }));

    expect(await seriesFor(1, matches, rows)).toEqual({ status: "unavailable" });
  });

  it("offers no chart for a team whose only group is a list of matches", async () => {
    // TASO sends no points for a knockout group, so it renders as matches.
    const matches = splitSeason(SPLIT_SEASON).filter((row) => row.groupId === 1);
    const rows = verifiedRows(matches, SPLIT_SEASON).map((row) => ({ ...row, points: null }));

    expect(await seriesFor(1, matches, rows)).toEqual({ status: "unavailable" });
  });

  it("reports no rounds for a team that has not played yet", async () => {
    const matches = splitSeason(SPLIT_SEASON)
      .filter((row) => row.groupId === 1)
      .map((row) => ({ ...row, status: "SCHEDULED", homeGoals: null, awayGoals: null }));

    expect(await seriesFor(1, matches, verifiedRows(matches, SPLIT_SEASON))).toEqual({
      status: "no-rounds",
    });
  });

  it("reports no rounds for a season with nothing in it", async () => {
    getSeasonMatchesMock.mockResolvedValue([]);
    getSeasonGroupsMock.mockResolvedValue([]);
    mockInsert();

    expect(await seriesFor(1, [], [])).toEqual({ status: "no-rounds" });
  });

  it("reports an error when the season cannot be read", async () => {
    getSeasonMatchesMock.mockRejectedValue(new Error("TASO down"));
    getSeasonGroupsMock.mockRejectedValue(new Error("TASO down"));

    expect(await seriesFor(1, [], [])).toEqual({ status: "error" });
  });

  it("reports an error, and logs it, when something throws", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(
      await getTeamPositionSeries(LEAGUE, SPLIT_SEASON, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: LEAGUE, teamProviderId: 1 }),
      "Unable to compute the TASO league position series"
    );
  });

  it("reads the matches and the group rows once each, however many rounds, and asks TASO nothing", async () => {
    /**
     * #331's constraint, and the budget the spec states for TASO: the group rows
     * are the one read the team page did not make before, and nothing is read or
     * fetched per round. A completed season with stored rows is never refetched.
     */
    const tenRounds = Array.from({ length: 10 }, (_, index) => [
      game(SPLIT_SEASON, 1, index + 1, 1, 2, [index % 3, 1]),
      game(SPLIT_SEASON, 1, index + 1, 3, 4, [1, index % 2]),
    ]).flat();
    const series = await seriesFor(1, tenRounds, verifiedRows(tenRounds, SPLIT_SEASON));

    expect(series.status === "ok" && series.points).toHaveLength(10);
    expect(dbMock.select).toHaveBeenCalledTimes(2);
    expect(getSeasonMatchesMock).not.toHaveBeenCalled();
    expect(getSeasonGroupsMock).not.toHaveBeenCalled();
    expect(getCachedMock).not.toHaveBeenCalled();
  });
});

describe("the result charts: form, goals, home and away, clean sheets", () => {
  /**
   * Team 1's match on `day` of September, in `groupId`. Rounds are numbered
   * against the calendar on purpose: form follows kickoff order.
   */
  function onDay(
    categoryId: string,
    competitionId: string,
    groupId: number,
    day: number,
    opponent: number,
    own: number,
    other: number,
    home = true
  ) {
    const [homeId, awayId] = home ? [1, opponent] : [opponent, 1];
    return match({
      providerMatchId: groupId * 1000 + day,
      categoryId,
      competitionCode: competitionId,
      groupId,
      groupName: `Lohko ${groupId}`,
      kickoffAt: new Date(`2024-09-${String(day).padStart(2, "0")}T15:00:00Z`),
      matchday: 40 - day,
      homeTeamProviderId: homeId,
      homeTeamName: `Team ${homeId}`,
      awayTeamProviderId: awayId,
      awayTeamName: `Team ${awayId}`,
      homeGoals: home ? own : other,
      awayGoals: home ? other : own,
      halfTimeHome: null,
      halfTimeAway: null,
    });
  }

  /** The same match with a half-time score, given from team 1's own side. */
  function withHalfTime<T extends { homeTeamProviderId: number }>(
    row: T,
    halfTime: readonly [number, number] | null
  ): T {
    if (halfTime === null) return row;
    const [own, other] = halfTime;
    const home = row.homeTeamProviderId === 1;
    return { ...row, halfTimeHome: home ? own : other, halfTimeAway: home ? other : own };
  }

  function rowsFor(
    categoryId: string,
    competitionId: string,
    groupId: number,
    teamIds: number[],
    points: number | null
  ) {
    return teamIds.map((teamProviderId) =>
      groupTeam({
        categoryId,
        competitionCode: competitionId,
        groupId,
        teamProviderId,
        teamName: `Team ${teamProviderId}`,
        points,
      })
    );
  }

  describe("getTeamSeasonComparison", () => {
    const LEAGUE = "M1";
    const SEASON = "spljp25";
    /** Team 1 wins both its matches in one ordinary group. */
    const matches = [
      onDay(LEAGUE, SEASON, 1, 1, 2, 3, 0),
      onDay(LEAGUE, SEASON, 1, 2, 3, 2, 0),
    ].map((row) => ({ ...row, categoryId: LEAGUE }));
    /**
     * Points that agree with `calculateStandings` over those two matches —
     * team 1 wins both — so the group is verified and its table ranks.
     */
    const rows = [
      groupTeam({
        categoryId: LEAGUE,
        competitionCode: SEASON,
        groupId: 1,
        teamProviderId: 1,
        teamName: "Team 1",
        points: 6,
      }),
      groupTeam({
        categoryId: LEAGUE,
        competitionCode: SEASON,
        groupId: 1,
        teamProviderId: 2,
        teamName: "Team 2",
        points: 0,
      }),
      groupTeam({
        categoryId: LEAGUE,
        competitionCode: SEASON,
        groupId: 1,
        teamProviderId: 3,
        teamName: "Team 3",
        points: 0,
      }),
    ];

    /**
     * A season id used by one test only.
     *
     * `classifySeasonGroups` is `cache()`d and `vi.clearAllMocks()` does not
     * clear that memo, so two tests that supply different stored rows under
     * one season id would poison each other — whichever ran first would decide
     * what the other saw. Found by `npm run test:shuffle`.
     */
    let nextSeason = PAST_SEASON;
    function ownSeason() {
      nextSeason -= 10;
      return nextSeason;
    }

    function seasonsFor(selected: number) {
      return [
        { competitionCode: LEAGUE, seasonId: selected, matches: 2 },
        { competitionCode: LEAGUE, seasonId: selected - 1, matches: 2 },
      ];
    }

    it("sets the season against the club's other league seasons", async () => {
      mockStoredMatches(matches, rows);

      const selected = ownSeason();
      const comparison = await getTeamSeasonComparison(
        LEAGUE,
        1,
        selected,
        ACTIVE_SEASON,
        seasonsFor(selected)
      );

      expect(comparison.status).toBe("ok");
      // The mock serves both reads the same rows, so the baseline equals the
      // season: what is asserted here is that a second season was read at all,
      // and named.
      expect(comparison.status === "ok" && comparison.seasons).toBe(1);
      expect(comparison.status === "ok" && comparison.competitions).toEqual(["Ykkönen"]);
      // The group's table ranks the club, so the position row has a value and
      // the panel can print it as a place.
      expect(comparison.status === "ok" && comparison.teamCount).toBe(3);
      expect(comparison.status === "ok" && comparison.rows[0]?.selected).toBeCloseTo(1 / 3, 10);
    });

    it("keeps a season whose table ranks nothing, because its results still count", async () => {
      // Published points that disagree with our calculation make the group
      // pass-through: it is shown, but it ranks nobody (specs/030).
      mockStoredMatches(matches, rowsFor(LEAGUE, SEASON, 1, [1, 2, 3], 99));

      const selected = ownSeason();
      const comparison = await getTeamSeasonComparison(
        LEAGUE,
        1,
        selected,
        ACTIVE_SEASON,
        seasonsFor(selected)
      );

      expect(comparison.status).toBe("ok");
      if (comparison.status !== "ok") return;
      expect(comparison.teamCount).toBeNull();
      expect(comparison.rows[0]?.measure).toBe("position");
      expect(comparison.rows[0]?.selected).toBeNull();
      // The rates are unaffected: two wins is still two wins.
      expect(comparison.rows.find((row) => row.measure === "points")?.selected).toBe(3);
    });

    it("reports an error when a season cannot be read at all", async () => {
      // Its own season ids, because `classifySeasonGroups` is `cache()`d and
      // `vi.clearAllMocks()` does not clear that memo: a failure cached here
      // under a season another test uses would surface as an error there,
      // depending on the order the suite happened to run in.
      const brokenSeason = ownSeason();
      mockStoredMatches([], []);
      getSeasonGroupsMock.mockRejectedValue(new Error("TASO unavailable"));
      getSeasonMatchesMock.mockRejectedValue(new Error("TASO unavailable"));

      expect(
        await getTeamSeasonComparison(LEAGUE, 1, brokenSeason, ACTIVE_SEASON, [
          { competitionCode: LEAGUE, seasonId: brokenSeason, matches: 1 },
        ])
      ).toEqual({ status: "error" });
    });

    it("has no panel when the club played no league match that season", async () => {
      // The season classifies, but this club is not in it.
      getSeasonGroupsMock.mockResolvedValue([]);
      getSeasonMatchesMock.mockResolvedValue([]);
      mockStoredMatches(matches, rows);

      const selected = ownSeason();
      expect(
        await getTeamSeasonComparison(LEAGUE, 99, selected, ACTIVE_SEASON, seasonsFor(selected))
      ).toEqual({ status: "unavailable" });
    });

    it("leaves out a season played entirely in knockout groups", async () => {
      // A "match-list" group is not a table, so its matches are not league
      // matches — the same rule `Vire`, `Maalit` and the standings table apply,
      // and why the playoff is excluded from `Putket`. Counting them here would
      // put matches in the baseline that the selected season's own measures
      // leave out.
      const knockout = [onDay(LEAGUE, SEASON, 9, 1, 5, 4, 0)].map((row) => ({
        ...row,
        categoryId: LEAGUE,
      }));
      mockStoredMatches(knockout, rowsFor(LEAGUE, SEASON, 9, [1, 5], null));

      const selected = ownSeason();
      expect(
        await getTeamSeasonComparison(LEAGUE, 1, selected, ACTIVE_SEASON, seasonsFor(selected))
      ).toEqual({ status: "unavailable" });
    });

    it("keeps a pass-through season, whose matches are league matches", async () => {
      // Its published points disagree with ours so it ranks nobody, but the
      // matches are in a table group and count towards every rate.
      mockStoredMatches(matches, rowsFor(LEAGUE, SEASON, 1, [1, 2, 3], 99));

      const selected = ownSeason();
      const comparison = await getTeamSeasonComparison(
        LEAGUE,
        1,
        selected,
        ACTIVE_SEASON,
        seasonsFor(selected)
      );

      expect(comparison.status).toBe("ok");
      if (comparison.status !== "ok") return;
      expect(comparison.rows[0]?.selected).toBeNull();
      expect(comparison.rows.find((row) => row.measure === "points")?.selected).toBe(3);
    });

    it("leaves out a competition the registry no longer carries", async () => {
      // `isDomesticCup` answers false for an unknown code, so a stored season
      // whose competition has left the registry would otherwise be treated as
      // a league and named by its raw code.
      mockStoredMatches(matches, rows);

      const selected = ownSeason();
      const comparison = await getTeamSeasonComparison(LEAGUE, 1, selected, ACTIVE_SEASON, [
        ...seasonsFor(selected),
        { competitionCode: "ZZZ", seasonId: selected - 2, matches: 30 },
      ]);

      expect(comparison.status === "ok" && comparison.seasons).toBe(1);
      expect(comparison.status === "ok" && comparison.competitions).toEqual(["Ykkönen"]);
    });

    it("leaves out a cup, which has no table to rank a position in", async () => {
      mockStoredMatches(matches, rows);

      const selected = ownSeason();
      const comparison = await getTeamSeasonComparison(LEAGUE, 1, selected, ACTIVE_SEASON, [
        ...seasonsFor(selected),
        { competitionCode: "MSC", seasonId: selected - 1, matches: 4 },
      ]);

      expect(comparison.status === "ok" && comparison.seasons).toBe(1);
    });

    it("has no panel when the season has no league matches for the club", async () => {
      // Reachable and empty, which is a season the app does not hold rather
      // than a failure.
      getSeasonGroupsMock.mockResolvedValue([]);
      getSeasonMatchesMock.mockResolvedValue([]);
      mockStoredMatches([], []);

      const selected = ownSeason();
      expect(
        await getTeamSeasonComparison(LEAGUE, 1, selected, ACTIVE_SEASON, seasonsFor(selected))
      ).toEqual({ status: "unavailable" });
    });

    it("reports an error rather than a plausible comparison when a read fails", async () => {
      const from = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockRejectedValue(new Error("no db")) }),
      }));
      dbMock.select.mockReturnValue({ from });

      const selected = ownSeason();
      expect(
        await getTeamSeasonComparison(LEAGUE, 1, selected, ACTIVE_SEASON, seasonsFor(selected))
      ).toEqual({ status: "error" });
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ competitionCode: LEAGUE }),
        "Unable to compare the TASO season with the club's others"
      );
    });
  });

  describe("a split season with a playoff", () => {
    /**
     * Ykkönen 2025: group 2 continues group 1 (`CARRY_OVER_CONFIG`). Group 9 is
     * a knockout — TASO sends no points for it — so it renders as a match list.
     * The table rows' points are made up, so both tables render pass-through:
     * form is results, and an unverified table does not stop it (Q2).
     */
    const LEAGUE = "M1";
    const SEASON = "spljp25";
    const matches = [
      onDay(LEAGUE, SEASON, 1, 1, 2, 2, 0),
      // Away, so the team is found on either side of a fixture.
      onDay(LEAGUE, SEASON, 1, 2, 3, 1, 1, false),
      onDay(LEAGUE, SEASON, 1, 3, 4, 0, 1),
      onDay(LEAGUE, SEASON, 1, 4, 2, 3, 0),
      onDay(LEAGUE, SEASON, 2, 5, 3, 2, 1),
      onDay(LEAGUE, SEASON, 2, 6, 2, 0, 0),
      onDay(LEAGUE, SEASON, 9, 7, 5, 4, 0),
    ].map((row) => ({ ...row, categoryId: LEAGUE }));
    const rows = [
      ...rowsFor(LEAGUE, SEASON, 1, [1, 2, 3, 4], 99),
      ...rowsFor(LEAGUE, SEASON, 2, [1, 2, 3], 99),
      ...rowsFor(LEAGUE, SEASON, 9, [1, 5], null),
    ];

    async function series() {
      mockStoredMatches(matches, rows);
      return getTeamFormSeries(LEAGUE, SEASON, 1, PAST_SEASON, ACTIVE_SEASON);
    }

    it("continues across the split in kickoff order, and leaves the playoff out", async () => {
      // W D L W, then W D after the split; the playoff win on the 7th is not
      // league form.
      expect(await series()).toEqual({
        status: "ok",
        points: [
          { match: 5, form: (3 + 1 + 0 + 3 + 3) / 5 },
          { match: 6, form: (1 + 0 + 3 + 3 + 1) / 5 },
        ],
      });
    });

    it("draws form where the tables are pass-through, and where the position cannot be", async () => {
      mockStoredMatches(matches, rows);
      const standings = await getSeasonStandings(
        LEAGUE,
        SEASON,
        PAST_SEASON,
        ACTIVE_SEASON,
        undefined
      );
      const kinds = standings.status === "ok" ? standings.groups.map((group) => group.kind) : [];
      mockStoredMatches(matches, rows);
      const position = await getTeamPositionSeries(LEAGUE, SEASON, 1, PAST_SEASON, ACTIVE_SEASON);

      expect(kinds).toEqual(["pass-through", "pass-through", "match-list"]);
      expect(position).toEqual({ status: "unavailable" });
      expect((await series()).status).toBe("ok");
    });

    it("counts the same league matches for goals: across the split, not the playoff", async () => {
      // Own goals, in kickoff order: 2–0, 1–1 (away), 0–1, 3–0, then 2–1, 0–0
      // after the split. The playoff's 4–0 is not league goals.
      mockStoredMatches(matches, rows);
      const goals = await getTeamGoalsSeries(LEAGUE, SEASON, 1, PAST_SEASON, ACTIVE_SEASON);

      expect(goals.status === "ok" && goals.totals.at(-1)).toEqual({
        match: 6,
        scored: 8,
        conceded: 3,
      });
      expect(goals.status === "ok" && goals.rolling).toEqual([
        { match: 5, scored: 8 / 5, conceded: 3 / 5 },
        { match: 6, scored: 6 / 5, conceded: 3 / 5 },
      ]);
    });

    it("splits the same league matches home and away, leaving the playoff out", async () => {
      // Home: 2–0, 0–1, 3–0, 2–1, 0–0. Away: 1–1. The playoff win is not league.
      mockStoredMatches(matches, rows);

      expect(await getTeamHomeAwaySeries(LEAGUE, SEASON, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
        status: "ok",
        home: { matches: 5, won: 3, drawn: 1, lost: 1, scored: 7, conceded: 2 },
        away: { matches: 1, won: 0, drawn: 1, lost: 0, scored: 1, conceded: 1 },
      });
    });

    it("counts clean sheets over the same league matches, not the playoff", async () => {
      // Conceded in the league, in kickoff order: 0, 1, 1, 0, 1, 0 — three.
      mockStoredMatches(matches, rows);

      const series = await getTeamCleanSheetSeries(LEAGUE, SEASON, 1, PAST_SEASON, ACTIVE_SEASON);

      expect(series.status === "ok" && series.points.at(-1)).toEqual({
        match: 6,
        kept: 3,
        share: 50,
      });
    });

    it("counts streaks over the same league matches, not the playoff", async () => {
      // W D L W W D in the league; the playoff win on the 7th is not counted.
      mockStoredMatches(matches, rows);

      expect(await getTeamStreaks(LEAGUE, SEASON, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
        status: "ok",
        current: { outcome: "draw", length: 1 },
        longest: {
          wins: { length: 2, from: 4, to: 5 },
          unbeaten: { length: 3, from: 4, to: 6 },
          defeats: { length: 1, from: 3, to: 3 },
          winless: { length: 2, from: 2, to: 3 },
        },
      });
    });

    it("counts both directions over the same league matches, not the playoff", async () => {
      /**
       * Half-time, from team 1's own side: 0–1 won, 0–1 drew, 1–0 lost (a lead
       * given away), 1–0 won, none stored, 0–0 level — and the playoff win,
       * trailing 0–3 at the break, is not a league match. Count that one and
       * `trailed` would rise to 3.
       */
      const halfTimes = [[0, 1], [0, 1], [1, 0], [1, 0], null, [0, 0], [0, 3]] as const;
      mockStoredMatches(
        matches.map((row, index) => withHalfTime(row, halfTimes[index] ?? null)),
        rows
      );

      expect(await getTeamComebacks(LEAGUE, SEASON, 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
        status: "ok",
        trailed: { matches: 2, won: 1, drew: 1, lost: 0 },
        led: { matches: 2, won: 1, drew: 0, lost: 1 },
        missing: 1,
        known: 5,
      });
    });

    it("reads nothing the position chart does not, and asks TASO nothing", async () => {
      await series();

      // The season's matches and its group rows: the same two reads the
      // position chart makes, `cache()`d between them on the team page.
      expect(dbMock.select).toHaveBeenCalledTimes(2);
      expect(getSeasonMatchesMock).not.toHaveBeenCalled();
      expect(getSeasonGroupsMock).not.toHaveBeenCalled();
    });
  });

  it("ends at the Vire column the standings page shows, in points", async () => {
    // One verified table: its rows' points are what our calculation gives, so
    // it renders own-calculated with a Vire column to compare with.
    const matches = [
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 1, 2, 2, 0),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 2, 3, 1, 1),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 3, 2, 0, 1),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 4, 3, 3, 0),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 5, 2, 2, 1),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 6, 3, 0, 0),
    ];
    const rows = calculateStandings(matches as unknown as NormalizedMatch[]).map((team) =>
      groupTeam({
        teamProviderId: team.teamProviderId,
        teamName: team.teamName,
        points: team.points,
      })
    );
    mockStoredMatches(matches, rows);
    const series = await getTeamFormSeries(
      CATEGORY_ID,
      COMPETITION_ID,
      1,
      PAST_SEASON,
      ACTIVE_SEASON
    );
    mockStoredMatches(matches, rows);
    const standings = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );
    const group = standings.status === "ok" ? standings.groups[0] : undefined;
    const row =
      group?.kind === "own-calculated"
        ? group.standings.find((team) => team.teamProviderId === 1)
        : undefined;
    const points = { V: 3, T: 1, H: 0 } as const;
    const vire = (row?.form ?? []).reduce((total, entry) => total + points[entry.result], 0);

    expect(group?.kind).toBe("own-calculated");
    expect(row?.form).toHaveLength(5);
    expect(series.status === "ok" && series.points.at(-1)?.form).toBe(vire / 5);
  });

  it("ends its goal totals at the TM and PM the standings page shows", async () => {
    const matches = [
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 1, 2, 2, 0),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 2, 3, 1, 1, false),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 3, 2, 0, 1),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 4, 3, 3, 0),
    ];
    const rows = calculateStandings(matches as unknown as NormalizedMatch[]).map((team) =>
      groupTeam({
        teamProviderId: team.teamProviderId,
        teamName: team.teamName,
        points: team.points,
      })
    );
    mockStoredMatches(matches, rows);
    const goals = await getTeamGoalsSeries(
      CATEGORY_ID,
      COMPETITION_ID,
      1,
      PAST_SEASON,
      ACTIVE_SEASON
    );
    mockStoredMatches(matches, rows);
    const standings = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );
    const group = standings.status === "ok" ? standings.groups[0] : undefined;
    const row =
      group?.kind === "own-calculated"
        ? group.standings.find((team) => team.teamProviderId === 1)
        : undefined;

    expect(group?.kind).toBe("own-calculated");
    expect(goals.status === "ok" && goals.totals.at(-1)).toMatchObject({
      scored: row?.goalsFor,
      conceded: row?.goalsAgainst,
    });
  });

  it("adds home and away up to the row the standings page shows", async () => {
    const matches = [
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 1, 2, 2, 0),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 2, 3, 1, 1, false),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 3, 2, 0, 1, false),
      onDay(CATEGORY_ID, COMPETITION_ID, 1, 4, 3, 3, 0),
    ];
    const rows = calculateStandings(matches as unknown as NormalizedMatch[]).map((team) =>
      groupTeam({
        teamProviderId: team.teamProviderId,
        teamName: team.teamName,
        points: team.points,
      })
    );
    mockStoredMatches(matches, rows);
    const series = await getTeamHomeAwaySeries(
      CATEGORY_ID,
      COMPETITION_ID,
      1,
      PAST_SEASON,
      ACTIVE_SEASON
    );
    mockStoredMatches(matches, rows);
    const standings = await getSeasonStandings(
      CATEGORY_ID,
      COMPETITION_ID,
      PAST_SEASON,
      ACTIVE_SEASON,
      undefined
    );
    const group = standings.status === "ok" ? standings.groups[0] : undefined;
    const row =
      group?.kind === "own-calculated"
        ? group.standings.find((team) => team.teamProviderId === 1)
        : undefined;
    if (series.status !== "ok") throw new Error("expected a series");
    const { home, away } = series;

    expect(group?.kind).toBe("own-calculated");
    expect(home.matches + away.matches).toBe(row?.played);
    expect(home.scored + away.scored).toBe(row?.goalsFor);
    expect(home.conceded + away.conceded).toBe(row?.goalsAgainst);
    expect(3 * (home.won + away.won) + home.drawn + away.drawn).toBe(row?.points);
  });

  it("has no home-and-away panel when the team played only in match lists", async () => {
    const matches = [onDay("M1", "spljp25", 9, 1, 5, 1, 0)].map((row) => ({
      ...row,
      categoryId: "M1",
    }));
    mockStoredMatches(matches, rowsFor("M1", "spljp25", 9, [1, 5], null));

    expect(await getTeamHomeAwaySeries("M1", "spljp25", 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "unavailable",
    });
  });

  it("has empty home and away sides for a season with nothing stored", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockResolvedValue([]);
    getSeasonGroupsMock.mockResolvedValue([]);
    mockInsert();

    const series = await getTeamHomeAwaySeries(
      CATEGORY_ID,
      COMPETITION_ID,
      1,
      PAST_SEASON,
      ACTIVE_SEASON
    );

    expect(series.status === "ok" && series.home.matches + series.away.matches).toBe(0);
  });

  it("reports a home-and-away error, and logs it, when the season cannot be read", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(
      await getTeamHomeAwaySeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CATEGORY_ID, teamProviderId: 1 }),
      "Unable to compute the TASO home and away series"
    );
  });

  it("reports a home-and-away error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));
    getSeasonGroupsMock.mockRejectedValue(new Error("provider unavailable"));

    expect(
      await getTeamHomeAwaySeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
  });

  it("has no streaks panel when the team played only in match lists", async () => {
    const matches = [onDay("M1", "spljp25", 9, 1, 5, 1, 0)].map((row) => ({
      ...row,
      categoryId: "M1",
    }));
    mockStoredMatches(matches, rowsFor("M1", "spljp25", 9, [1, 5], null));

    expect(await getTeamStreaks("M1", "spljp25", 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "unavailable",
    });
  });

  it("has no streaks for a season with nothing stored", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockResolvedValue([]);
    getSeasonGroupsMock.mockResolvedValue([]);
    mockInsert();

    const streaks = await getTeamStreaks(
      CATEGORY_ID,
      COMPETITION_ID,
      1,
      PAST_SEASON,
      ACTIVE_SEASON
    );

    expect(streaks.status === "ok" && streaks.current).toBeNull();
  });

  it("reports a streaks error, and logs it, when the season cannot be read", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(
      await getTeamStreaks(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CATEGORY_ID, teamProviderId: 1 }),
      "Unable to compute the TASO streaks"
    );
  });

  it("has no comebacks panel when the team played only in match lists", async () => {
    const matches = [onDay("M1", "spljp25", 9, 1, 5, 1, 0)].map((row) => ({
      ...row,
      categoryId: "M1",
    }));
    mockStoredMatches(matches, rowsFor("M1", "spljp25", 9, [1, 5], null));

    expect(await getTeamComebacks("M1", "spljp25", 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "unavailable",
    });
  });

  it("has no comebacks for a season with nothing stored", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockResolvedValue([]);
    getSeasonGroupsMock.mockResolvedValue([]);
    mockInsert();

    expect(
      await getTeamComebacks(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({
      status: "ok",
      trailed: { matches: 0, won: 0, drew: 0, lost: 0 },
      led: { matches: 0, won: 0, drew: 0, lost: 0 },
      missing: 0,
      known: 0,
    });
  });

  it("reports a comebacks error, and logs it, when the season cannot be read", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(
      await getTeamComebacks(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CATEGORY_ID, teamProviderId: 1 }),
      "Unable to compute the TASO comebacks"
    );
  });

  it("has no clean-sheet panel when the team played only in match lists", async () => {
    const matches = [onDay("M1", "spljp25", 9, 1, 5, 1, 0)].map((row) => ({
      ...row,
      categoryId: "M1",
    }));
    mockStoredMatches(matches, rowsFor("M1", "spljp25", 9, [1, 5], null));

    expect(await getTeamCleanSheetSeries("M1", "spljp25", 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "unavailable",
    });
  });

  it("has no clean-sheet points for a season with nothing stored", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockResolvedValue([]);
    getSeasonGroupsMock.mockResolvedValue([]);
    mockInsert();

    expect(
      await getTeamCleanSheetSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "ok", points: [] });
  });

  it("reports a clean-sheet error, and logs it, when the season cannot be read", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(
      await getTeamCleanSheetSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CATEGORY_ID, teamProviderId: 1 }),
      "Unable to compute the TASO clean-sheet series"
    );
  });

  it("has no goals panels when the team played only in match lists", async () => {
    const matches = [onDay("M1", "spljp25", 9, 1, 5, 1, 0)].map((row) => ({
      ...row,
      categoryId: "M1",
    }));
    mockStoredMatches(matches, rowsFor("M1", "spljp25", 9, [1, 5], null));

    expect(await getTeamGoalsSeries("M1", "spljp25", 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "unavailable",
    });
  });

  it("has neither goals series for a season with nothing stored", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockResolvedValue([]);
    getSeasonGroupsMock.mockResolvedValue([]);
    mockInsert();

    expect(
      await getTeamGoalsSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "ok", rolling: [], totals: [] });
  });

  it("reports a goals error, and logs it, when the season cannot be read", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(
      await getTeamGoalsSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CATEGORY_ID, teamProviderId: 1 }),
      "Unable to compute the TASO goals series"
    );
  });

  it("reports a goals error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));
    getSeasonGroupsMock.mockRejectedValue(new Error("provider unavailable"));

    expect(
      await getTeamGoalsSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
  });

  it("has no section when the team played only in match lists", async () => {
    const matches = [onDay("M1", "spljp25", 9, 1, 5, 1, 0)].map((row) => ({
      ...row,
      categoryId: "M1",
    }));
    mockStoredMatches(matches, rowsFor("M1", "spljp25", 9, [1, 5], null));

    expect(await getTeamFormSeries("M1", "spljp25", 1, PAST_SEASON, ACTIVE_SEASON)).toEqual({
      status: "unavailable",
    });
  });

  it("has no series before the fifth league match", async () => {
    const matches = [1, 2, 3, 4].map((day) => onDay(CATEGORY_ID, COMPETITION_ID, 1, day, 2, 1, 0));
    mockStoredMatches(matches, rowsFor(CATEGORY_ID, COMPETITION_ID, 1, [1, 2], 99));

    expect(
      await getTeamFormSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "too-few" });
  });

  it("has no series for a season with nothing stored", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockResolvedValue([]);
    getSeasonGroupsMock.mockResolvedValue([]);
    mockInsert();

    expect(
      await getTeamFormSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "too-few" });
  });

  it("reports an error when nothing is stored and the refresh failed", async () => {
    mockStoredMatches([], []);
    getSeasonMatchesMock.mockRejectedValue(new Error("provider unavailable"));
    getSeasonGroupsMock.mockRejectedValue(new Error("provider unavailable"));

    expect(
      await getTeamFormSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
  });

  it("reports an error, and logs it, when the season cannot be read at all", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("database down");
    });

    expect(
      await getTeamFormSeries(CATEGORY_ID, COMPETITION_ID, 1, PAST_SEASON, ACTIVE_SEASON)
    ).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CATEGORY_ID, teamProviderId: 1 }),
      "Unable to compute the TASO form series"
    );
  });
});
