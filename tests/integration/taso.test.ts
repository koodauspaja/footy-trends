import { and, between, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { tasoGroupTeams, tasoMatches } from "@/db/schema";
import { calculateStandings } from "@/lib/standings";
import type { NormalizedTasoMatch } from "@/lib/taso";
import { synchronizeGroupTeams } from "@/lib/taso-standings-service";

/**
 * The TASO sync and the reads over its rows, against a real Postgres. Carry-over
 * config validation is in `tests/unit/lib/taso-carry-over.test.ts`, not here.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/036-halftime-comebacks.md
 * decisions/127-carry-over-config-validation.md
 * decisions/196-concurrent-group-syncs.md
 * decisions/644-stored-table-behind-results.md
 * decisions/666-taso-fixtures-cleared-file-wide.md
 */

vi.mock("@/lib/taso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso")>();
  return { ...actual, getSeasonMatches: vi.fn(), getSeasonGroups: vi.fn() };
});

const competitionId = "spljp901101";
const seasonId = 901101;
// Makes `seasonId` a completed past season, not the one being played.
const laterActiveSeasonId = seasonId + 1;

const CATEGORY_ID = "VL";

// Narrows to matches with a final score, mirroring standings-service.ts's own filter.
function toFinishedMatches<T extends { homeGoals: number | null; awayGoals: number | null }>(
  rows: T[]
): Array<T & { homeGoals: number; awayGoals: number }> {
  return rows.filter(
    (row): row is T & { homeGoals: number; awayGoals: number } =>
      row.homeGoals !== null && row.awayGoals !== null
  );
}

function buildMatch(overrides: Partial<NormalizedTasoMatch> = {}): NormalizedTasoMatch {
  return {
    providerMatchId: 901001,
    competitionCode: competitionId,
    categoryId: CATEGORY_ID,
    seasonId,
    groupId: 1,
    groupName: "Runkosarja",
    status: "FINISHED",
    kickoffAt: new Date("2026-08-01T15:00:00Z"),
    matchday: 1,
    homeTeamProviderId: 9001,
    homeTeamName: "Integration United",
    awayTeamProviderId: 9002,
    awayTeamName: "Integration City",
    homeGoals: 2,
    awayGoals: 1,
    halfTimeHome: null,
    halfTimeAway: null,
    winner: null,
    ...overrides,
  };
}

// Scoped by season and competition, so it clears every category's fixtures alike.
async function clearFixtures() {
  await db
    .delete(tasoMatches)
    .where(and(eq(tasoMatches.seasonId, seasonId), eq(tasoMatches.competitionCode, competitionId)));
  // Group rows too. The concurrency test writes them, and leaving them behind
  // lets one run's fixtures decide whether the next run's assertions hold.
  await db.delete(tasoGroupTeams).where(eq(tasoGroupTeams.competitionCode, "spljp99"));
}

// At the top level, so every describe in the file is covered, not only the first.
beforeEach(clearFixtures);

afterEach(async () => {
  await clearFixtures();
  vi.clearAllMocks();
});

// Every season this file writes is in its own fixture block, 901xxx.
const FIXTURE_SEASONS = { first: 901000, last: 901999 };

// The file leaves the database as it found it, so e2e can run after it.
afterAll(async () => {
  const leftMatches = await db
    .select({ seasonId: tasoMatches.seasonId })
    .from(tasoMatches)
    .where(between(tasoMatches.seasonId, FIXTURE_SEASONS.first, FIXTURE_SEASONS.last));
  const leftGroupTeams = await db
    .select({ seasonId: tasoGroupTeams.seasonId })
    .from(tasoGroupTeams)
    .where(between(tasoGroupTeams.seasonId, FIXTURE_SEASONS.first, FIXTURE_SEASONS.last));

  expect({ leftMatches, leftGroupTeams }).toEqual({ leftMatches: [], leftGroupTeams: [] });
});

describe("taso integration", () => {
  it("persists synchronized matches, readable back with the same shape calculateStandings expects", async () => {
    const { synchronizeMatches } = await import("@/lib/taso-standings-service");
    const providerMatches = [buildMatch()];

    await synchronizeMatches(providerMatches);
    const stored = await db
      .select()
      .from(tasoMatches)
      .where(
        and(eq(tasoMatches.competitionCode, competitionId), eq(tasoMatches.seasonId, seasonId))
      );

    expect(stored).toHaveLength(1);
    expect(calculateStandings(toFinishedMatches(stored))).toEqual(
      calculateStandings(toFinishedMatches(providerMatches))
    );
  });

  it("does not duplicate a match when the same provider response is synchronized twice", async () => {
    const { synchronizeMatches } = await import("@/lib/taso-standings-service");
    const providerMatch = buildMatch({ homeGoals: 3, awayGoals: 0 });

    await synchronizeMatches([providerMatch]);
    await synchronizeMatches([{ ...providerMatch, homeGoals: 1, awayGoals: 1 }]);

    const stored = await db
      .select()
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, providerMatch.providerMatchId));

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ homeGoals: 1, awayGoals: 1 });
  });

  it("round-trips the half-time score, a goalless first half included", async () => {
    const { synchronizeMatches } = await import("@/lib/taso-standings-service");
    const goalless = buildMatch({ providerMatchId: 901011, halfTimeHome: 0, halfTimeAway: 0 });
    const behind = buildMatch({ providerMatchId: 901012, halfTimeHome: 0, halfTimeAway: 1 });

    await synchronizeMatches([goalless, behind]);
    const stored = await db
      .select()
      .from(tasoMatches)
      .where(
        and(eq(tasoMatches.competitionCode, competitionId), eq(tasoMatches.seasonId, seasonId))
      );

    expect(
      stored
        .map((row) => [row.providerMatchId, row.halfTimeHome, row.halfTimeAway])
        .sort((a, b) => Number(a[0]) - Number(b[0]))
    ).toEqual([
      [901011, 0, 0],
      [901012, 0, 1],
    ]);
  });

  it("fills in a half-time score a later sync brings, which is what the backfill does", async () => {
    // TASO gives no half-time score for some matches, and rows stored before the
    // columns existed have `null` here.
    const { synchronizeMatches } = await import("@/lib/taso-standings-service");
    const providerMatch = buildMatch({ halfTimeHome: null, halfTimeAway: null });

    await synchronizeMatches([providerMatch]);
    await synchronizeMatches([{ ...providerMatch, halfTimeHome: 1, halfTimeAway: 2 }]);

    const stored = await db
      .select()
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, providerMatch.providerMatchId));

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ halfTimeHome: 1, halfTimeAway: 2 });
  });

  // One `competition_id` is the whole season umbrella, and `group_id` is only
  // unique within a category.
  it("keeps two categories' identically-numbered groups apart", async () => {
    const { synchronizeMatches, getSeasonStandings, getSeasonMatchList } = await import(
      "@/lib/taso-standings-service"
    );
    const otherCategoryId = "M2";

    await synchronizeMatches([
      buildMatch({ providerMatchId: 901001, groupId: 1, groupName: "Runkosarja" }),
      buildMatch({
        providerMatchId: 901002,
        categoryId: otherCategoryId,
        groupId: 1,
        groupName: "Lohko A",
        homeTeamProviderId: 9101,
        homeTeamName: "Kakkonen Rovers",
        awayTeamProviderId: 9102,
        awayTeamName: "Kakkonen Athletic",
      }),
    ]);

    const veikkausliiga = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      seasonId,
      undefined
    );
    const kakkonen = await getSeasonStandings(
      otherCategoryId,
      competitionId,
      seasonId,
      seasonId,
      undefined
    );

    // One group each, under its own name — not one merged group 1 of four teams.
    expect(veikkausliiga.status === "ok" && veikkausliiga.groups.map((g) => g.groupName)).toEqual([
      "Runkosarja",
    ]);
    expect(kakkonen.status === "ok" && kakkonen.groups.map((g) => g.groupName)).toEqual([
      "Lohko A",
    ]);

    const veikkausliigaTeams =
      veikkausliiga.status === "ok" && veikkausliiga.groups[0]?.kind === "own-calculated"
        ? veikkausliiga.groups[0].standings.map((team) => team.teamName).sort()
        : [];
    expect(veikkausliigaTeams).toEqual(["Integration City", "Integration United"]);

    // And the match lists stay separate too, not just the tables.
    const kakkonenMatches = await getSeasonMatchList(
      otherCategoryId,
      competitionId,
      seasonId,
      seasonId
    );
    expect(kakkonenMatches.status === "ok" && kakkonenMatches.matches).toHaveLength(1);
    expect(kakkonenMatches.status === "ok" && kakkonenMatches.matches[0]?.providerMatchId).toBe(
      901002
    );
  });

  it("own-calculates the origin group from stored matches, round-filtered", async () => {
    const { synchronizeMatches, getSeasonStandings } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({ providerMatchId: 901001, matchday: 1 }),
      buildMatch({
        providerMatchId: 901002,
        matchday: 2,
        homeTeamProviderId: 9002,
        awayTeamProviderId: 9001,
        homeGoals: 0,
        awayGoals: 0,
        halfTimeHome: null,
        halfTimeAway: null,
      }),
    ]);

    const full = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      seasonId,
      undefined
    );
    const roundOne = await getSeasonStandings(CATEGORY_ID, competitionId, seasonId, seasonId, 1);

    expect(full.status).toBe("ok");
    expect(full.status === "ok" && full.groups).toHaveLength(1);
    const unitedFull =
      full.status === "ok" &&
      full.groups[0]?.kind === "own-calculated" &&
      full.groups[0].standings.find((team) => team.teamName === "Integration United");
    expect(unitedFull).toMatchObject({ played: 2 });

    const unitedRoundOne =
      roundOne.status === "ok" &&
      roundOne.groups[0]?.kind === "own-calculated" &&
      roundOne.groups[0].standings.find((team) => team.teamName === "Integration United");
    expect(unitedRoundOne).toMatchObject({ played: 1 });
  });

  it("shows a scheduled-only team as a zero-stats row via roster seeding, same as football-data.org standings", async () => {
    const { synchronizeMatches, getSeasonStandings, getTeamMatches } = await import(
      "@/lib/taso-standings-service"
    );
    const finished = buildMatch();
    const upcoming = buildMatch({
      providerMatchId: 901002,
      status: "SCHEDULED",
      homeGoals: null,
      awayGoals: null,
      halfTimeHome: null,
      halfTimeAway: null,
      matchday: 2,
      homeTeamProviderId: 9003,
      homeTeamName: "Integration Rovers",
    });

    await synchronizeMatches([finished, upcoming]);

    const standings = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      seasonId,
      undefined
    );
    expect(standings.status).toBe("ok");
    const rovers =
      standings.status === "ok" &&
      standings.groups[0]?.kind === "own-calculated" &&
      standings.groups[0].standings.find((team) => team.teamName === "Integration Rovers");
    expect(rovers).toMatchObject({ played: 0, points: 0 });

    const teamMatches = await getTeamMatches(CATEGORY_ID, competitionId, 9003, seasonId, seasonId);
    expect(teamMatches).toEqual({ status: "ok", matches: [expect.objectContaining(upcoming)] });
  });

  it("lists a team's matches chronologically across groups it appeared in", async () => {
    const { synchronizeMatches, getTeamMatches } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({
        providerMatchId: 901002,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
      buildMatch({
        providerMatchId: 901001,
        groupId: 1,
        groupName: "Runkosarja",
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
      }),
    ]);

    const result = await getTeamMatches(CATEGORY_ID, competitionId, 9001, seasonId, seasonId);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([
      901001, 901002,
    ]);
    expect(result.status === "ok" && result.matches.map((m) => m.groupName)).toEqual([
      "Runkosarja",
      "Mestaruussarja",
    ]);
  });

  it("getSeasonMatchList returns every group's matches with group_name attached, sorted by kickoff", async () => {
    const { synchronizeMatches, getSeasonMatchList } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({
        providerMatchId: 901002,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
      buildMatch({ providerMatchId: 901001, kickoffAt: new Date("2026-08-01T15:00:00Z") }),
    ]);

    const result = await getSeasonMatchList(CATEGORY_ID, competitionId, seasonId, seasonId);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([
      901001, 901002,
    ]);
  });

  it("backfills a season with no stored matches from the provider", async () => {
    const { getSeasonMatches } = await import("@/lib/taso");
    const providerMatches = [buildMatch()];
    vi.mocked(getSeasonMatches).mockResolvedValue(providerMatches);

    const { getSeasonStandings } = await import("@/lib/taso-standings-service");
    const result = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      laterActiveSeasonId,
      undefined
    );

    const stored = await db
      .select()
      .from(tasoMatches)
      .where(
        and(eq(tasoMatches.competitionCode, competitionId), eq(tasoMatches.seasonId, seasonId))
      );

    expect(getSeasonMatches).toHaveBeenCalledWith(competitionId, CATEGORY_ID, seasonId);
    expect(stored).toHaveLength(1);
    expect(result.status).toBe("ok");
  });

  it("never refetches a past season that already has stored matches, however stale", async () => {
    const { getSeasonMatches } = await import("@/lib/taso");
    const { synchronizeMatches, getSeasonStandings } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([buildMatch()]);

    const result = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      laterActiveSeasonId,
      undefined
    );

    expect(getSeasonMatches).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });
});

describe("synchronizeGroupTeams concurrency", () => {
  it("survives concurrent syncs against an empty table", async () => {
    // The delete inside the transaction locks nothing when the season has no rows
    // yet, so two concurrent syncs on a cold database both insert.
    const seasonId = 901102;
    const rows = [1, 2, 3].map((id) => ({
      categoryId: "VL",
      competitionCode: "spljp99",
      seasonId,
      groupId: 1,
      teamProviderId: id,
      teamName: `Team ${id}`,
      points: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    })) as Parameters<typeof synchronizeGroupTeams>[3];

    const results = await Promise.allSettled([
      synchronizeGroupTeams("VL", "spljp99", seasonId, rows, []),
      synchronizeGroupTeams("VL", "spljp99", seasonId, rows, []),
      synchronizeGroupTeams("VL", "spljp99", seasonId, rows, []),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const stored = await db
      .select()
      .from(tasoGroupTeams)
      .where(eq(tasoGroupTeams.seasonId, seasonId));
    expect(stored).toHaveLength(3);
  });
});

describe("synchronizeGroupTeams and a table TASO serves as unplayed", () => {
  const season = 901103;

  function row(
    groupId: number,
    teamProviderId: number,
    points: number,
    played: number,
    startingPoints = 0
  ) {
    return {
      categoryId: "VL",
      competitionCode: "spljp99",
      seasonId: season,
      groupId,
      teamProviderId,
      teamName: `Team ${teamProviderId}`,
      startingPoints,
      points,
      played,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    };
  }

  // The page's refresh and the backfill carry; `replace` is an administrator's refresh.
  async function sync(rows: ReturnType<typeof row>[], { replace = false } = {}) {
    await synchronizeGroupTeams(
      "VL",
      "spljp99",
      season,
      rows as Parameters<typeof synchronizeGroupTeams>[3],
      [],
      db,
      { carryStartingPoints: !replace }
    );
  }

  async function stored() {
    const rows = await db.select().from(tasoGroupTeams).where(eq(tasoGroupTeams.seasonId, season));
    return rows
      .map((team) => [
        team.groupId,
        team.teamProviderId,
        team.points,
        team.played,
        team.startingPoints,
      ])
      .sort(
        (left, right) => Number(left[0]) - Number(right[0]) || Number(left[1]) - Number(right[1])
      );
  }

  it("writes the unplayed group with each team's stored starting points, and the other group as it comes", async () => {
    await sync([
      row(1, 1, 30, 18),
      row(2, 1, 31, 24, 26),
      row(2, 2, 25, 24, -3),
      row(2, 3, 20, 24),
    ]);

    // Group 1 moves on a match; group 2 comes back at zero, a team gone from it.
    await sync([row(1, 1, 33, 19), row(2, 1, 0, 0), row(2, 2, 0, 0)]);

    expect(await stored()).toEqual([
      [1, 1, 33, 19, 0],
      [2, 1, 0, 0, 26],
      [2, 2, 0, 0, -3],
    ]);
  });

  it("carries the starting points again on the next unplayed snapshot, and drops them for one with figures", async () => {
    await sync([row(2, 1, 31, 24, 26)]);
    await sync([row(2, 1, 0, 0)]);
    await sync([row(2, 1, 0, 0)]);
    expect(await stored()).toEqual([[2, 1, 0, 0, 26]]);

    await sync([row(2, 1, 34, 25, 27)]);
    expect(await stored()).toEqual([[2, 1, 34, 25, 27]]);
  });

  it("takes a group with figures as it comes, a lifted deduction included", async () => {
    await sync([row(1, 1, 27, 18, -3), row(2, 1, 5, 2)]);

    // Group 2 comes back unplayed. Group 1 has figures and no deduction any
    // more: that is TASO's answer, and nothing stored is put back into it.
    await sync([row(1, 1, 33, 19), row(2, 1, 0, 0)]);

    expect(await stored()).toEqual([
      [1, 1, 33, 19, 0],
      [2, 1, 0, 0, 0],
    ]);
  });

  it("keeps each group's starting points apart when two come back unplayed with the same team", async () => {
    await sync([row(2, 1, 31, 24, 26), row(3, 1, 12, 6, -3)]);

    await sync([row(2, 1, 0, 0), row(3, 1, 0, 0)]);

    expect(await stored()).toEqual([
      [2, 1, 0, 0, 26],
      [3, 1, 0, 0, -3],
    ]);
  });

  it("replaces the rows, starting points and all, when it is not asked to carry them", async () => {
    await sync([row(2, 1, 31, 24, 26)]);

    await sync([row(2, 1, 0, 0)], { replace: true });

    expect(await stored()).toEqual([[2, 1, 0, 0, 0]]);
  });
});

describe("a stored TASO table behind the stored results", () => {
  const behindSeason = 901103;
  const behindCompetition = "spljp901103";

  async function clear() {
    await db.delete(tasoMatches).where(eq(tasoMatches.seasonId, behindSeason));
    await db.delete(tasoGroupTeams).where(eq(tasoGroupTeams.seasonId, behindSeason));
  }
  beforeEach(clear);
  afterEach(clear);

  // United beat City, then the two draw: ours has United at 4 points and City at
  // 1, two matches each. TASO's stored rows are from before the draw.
  async function storeSeason(rows: Array<{ team: number; played: number; points: number }>) {
    const { synchronizeMatches } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({
        providerMatchId: 9011031,
        competitionCode: behindCompetition,
        seasonId: behindSeason,
        matchday: 1,
      }),
      buildMatch({
        providerMatchId: 9011032,
        competitionCode: behindCompetition,
        seasonId: behindSeason,
        matchday: 2,
        homeTeamProviderId: 9002,
        homeTeamName: "Integration City",
        awayTeamProviderId: 9001,
        awayTeamName: "Integration United",
        homeGoals: 0,
        awayGoals: 0,
      }),
    ]);
    await synchronizeGroupTeams(
      CATEGORY_ID,
      behindCompetition,
      behindSeason,
      rows.map(({ team, played, points }) => ({
        categoryId: CATEGORY_ID,
        competitionCode: behindCompetition,
        seasonId: behindSeason,
        groupId: 1,
        teamProviderId: team,
        teamName: team === 9001 ? "Integration United" : "Integration City",
        startingPoints: 0,
        points,
        played,
        won: null,
        drawn: null,
        lost: null,
        goalsFor: null,
        goalsAgainst: null,
        goalDifference: null,
        currentStanding: null,
        finalGroupStanding: null,
      })),
      []
    );
  }

  async function group() {
    const { getSeasonStandings } = await import("@/lib/taso-standings-service");
    // A finished season, so nothing is asked of TASO.
    const result = await getSeasonStandings(
      CATEGORY_ID,
      behindCompetition,
      behindSeason,
      behindSeason + 1,
      undefined
    );
    return result.status === "ok" ? result.groups[0] : undefined;
  }

  it("renders our own table, and leaves the stored rows as they are", async () => {
    await storeSeason([
      { team: 9001, played: 1, points: 3 },
      { team: 9002, played: 1, points: 0 },
    ]);

    const shown = await group();

    expect(shown?.kind).toBe("own-calculated");
    expect(
      shown?.kind === "own-calculated" &&
        shown.standings.map((team) => [team.teamProviderId, team.played, team.points])
    ).toEqual([
      [9001, 2, 4],
      [9002, 2, 1],
    ]);
    const stored = await db
      .select()
      .from(tasoGroupTeams)
      .where(eq(tasoGroupTeams.seasonId, behindSeason));
    expect(stored.map((row) => [row.teamProviderId, row.played, row.points]).sort()).toEqual([
      [9001, 1, 3],
      [9002, 1, 0],
    ]);
  });

  it("keeps TASO's numbers when a team level with us on matches has other points", async () => {
    await storeSeason([
      { team: 9001, played: 2, points: 1 },
      { team: 9002, played: 1, points: 0 },
    ]);

    expect((await group())?.kind).toBe("pass-through");
  });
});
