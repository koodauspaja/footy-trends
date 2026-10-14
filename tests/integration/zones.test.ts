import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { tasoGroupTeams, tasoGroupZones, tasoMatches } from "@/db/schema";
import type { NormalizedTasoGroupLevel, NormalizedTasoGroupTeam } from "@/lib/taso";
import { getSeasonGroups } from "@/lib/taso";
import {
  getSeasonStandings,
  synchronizeGroupLevels,
  synchronizeGroupTeams,
  synchronizeMatches,
} from "@/lib/taso-standings-service";
import { backfillZones } from "@/lib/zone-backfill";

/**
 * Zone levels against a real Postgres: written with a season's group rows and
 * replaced by the next sync, read back with the standings, and backfilled
 * without touching a team row.
 *
 * decisions/063-competition-zones.md
 */
vi.mock("@/lib/taso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso")>();
  return { ...actual, getSeasonMatches: vi.fn(), getSeasonGroups: vi.fn() };
});

const SEASON = 2093;
const OTHER_SEASON = 2094;
const COMPETITION = "spljp93";
const OTHER_COMPETITION = "spljp94";
const SEASONS = [SEASON, OTHER_SEASON];

function level(overrides: Partial<NormalizedTasoGroupLevel> = {}): NormalizedTasoGroupLevel {
  return {
    categoryId: "VL",
    competitionCode: COMPETITION,
    seasonId: SEASON,
    groupId: 1,
    level: 1,
    teamCount: 1,
    label: "Kultaa",
    ...overrides,
  };
}

function team(overrides: Partial<NormalizedTasoGroupTeam> = {}): NormalizedTasoGroupTeam {
  return {
    categoryId: "VL",
    competitionCode: COMPETITION,
    seasonId: SEASON,
    groupId: 1,
    teamProviderId: 9301,
    teamName: "Zone United",
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
    ...overrides,
  };
}

async function storedLevels(seasonId = SEASON) {
  const rows = await db
    .select()
    .from(tasoGroupZones)
    .where(eq(tasoGroupZones.seasonId, seasonId))
    .orderBy(
      asc(tasoGroupZones.categoryId),
      asc(tasoGroupZones.groupId),
      asc(tasoGroupZones.level)
    );
  return rows.map((row) => [row.categoryId, row.groupId, row.level, row.teamCount, row.label]);
}

async function clearFixtures() {
  await db.delete(tasoGroupZones).where(inArray(tasoGroupZones.seasonId, SEASONS));
  await db.delete(tasoGroupTeams).where(inArray(tasoGroupTeams.seasonId, SEASONS));
  await db.delete(tasoMatches).where(inArray(tasoMatches.seasonId, SEASONS));
}

beforeEach(async () => {
  vi.mocked(getSeasonGroups).mockReset();
  await clearFixtures();
});
afterAll(clearFixtures);

describe("a sync of a season's group rows", () => {
  it("stores the levels with the rows", async () => {
    await synchronizeGroupTeams(
      "VL",
      COMPETITION,
      SEASON,
      [team()],
      [
        level(),
        level({ level: 2, teamCount: 3, label: null }),
        level({ groupId: 2, level: 5, teamCount: 1, label: "Liigakarsintaan" }),
      ]
    );

    expect(await storedLevels()).toEqual([
      ["VL", 1, 1, 1, "Kultaa"],
      ["VL", 1, 2, 3, null],
      ["VL", 2, 5, 1, "Liigakarsintaan"],
    ]);
  });

  it("replaces the season's earlier levels, and only that season's and that competition's", async () => {
    await synchronizeGroupTeams(
      "VL",
      COMPETITION,
      SEASON,
      [team()],
      [level(), level({ level: 2, label: "Hopeaa" }), level({ groupId: 2, label: "Putoaa" })]
    );
    await synchronizeGroupLevels("M1", COMPETITION, SEASON, [
      level({ categoryId: "M1", label: "Nousee" }),
    ]);
    // Another season under the same competition id: the season alone tells them apart.
    await synchronizeGroupLevels("VL", COMPETITION, OTHER_SEASON, [
      level({ seasonId: OTHER_SEASON, label: "Pronssia" }),
    ]);

    // The next snapshot renames one level, drops another, and no longer has group 2.
    await synchronizeGroupTeams(
      "VL",
      COMPETITION,
      SEASON,
      [team()],
      [level({ teamCount: 2, label: "Mestari" })]
    );

    expect(await storedLevels()).toEqual([
      ["M1", 1, 1, 1, "Nousee"],
      ["VL", 1, 1, 2, "Mestari"],
    ]);
    expect(await storedLevels(OTHER_SEASON)).toEqual([["VL", 1, 1, 1, "Pronssia"]]);
  });

  it("clears the levels when the next snapshot has none", async () => {
    await synchronizeGroupTeams("VL", COMPETITION, SEASON, [team()], [level()]);

    await synchronizeGroupTeams("VL", COMPETITION, SEASON, [team()], []);

    expect(await storedLevels()).toEqual([]);
  });

  it("stores no level for Miesten Kakkonen or a junior competition", async () => {
    for (const categoryId of ["M2", "P21SM"]) {
      await synchronizeGroupTeams(
        categoryId,
        COMPETITION,
        SEASON,
        [team({ categoryId })],
        [level({ categoryId })]
      );
    }

    expect(await storedLevels()).toEqual([]);
    const teams = await db.select().from(tasoGroupTeams).where(eq(tasoGroupTeams.seasonId, SEASON));
    expect(teams.map((row) => row.categoryId).sort()).toEqual(["M2", "P21SM"]);
  });

  it("keeps the earlier levels and rows when the write of the rows fails", async () => {
    await synchronizeGroupTeams("VL", COMPETITION, SEASON, [team()], [level()]);

    await expect(
      synchronizeGroupTeams(
        "VL",
        COMPETITION,
        SEASON,
        // A name the column refuses, so the insert after the two deletes fails.
        [team({ teamName: null as unknown as string })],
        [level({ label: "Mestari" })]
      )
    ).rejects.toThrow();

    expect(await storedLevels()).toEqual([["VL", 1, 1, 1, "Kultaa"]]);
  });

  it("survives two syncs of the same season at once", async () => {
    const results = await Promise.allSettled([
      synchronizeGroupTeams("VL", COMPETITION, SEASON, [team()], [level()]),
      synchronizeGroupTeams("VL", COMPETITION, SEASON, [team()], [level()]),
      synchronizeGroupTeams("VL", COMPETITION, SEASON, [team()], [level()]),
    ]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    expect(await storedLevels()).toEqual([["VL", 1, 1, 1, "Kultaa"]]);
  });
});

describe("a standings read", () => {
  it("returns the stored levels of the season, each group's in order, without asking TASO", async () => {
    await synchronizeMatches([
      {
        providerMatchId: 9300001,
        competitionCode: COMPETITION,
        categoryId: "VL",
        seasonId: SEASON,
        groupId: 1,
        groupName: "Runkosarja",
        status: "FINISHED",
        kickoffAt: new Date("2093-05-01T15:00:00Z"),
        matchday: 1,
        homeTeamProviderId: 9301,
        homeTeamName: "Zone United",
        awayTeamProviderId: 9302,
        awayTeamName: "Zone City",
        homeGoals: 2,
        awayGoals: 0,
        halfTimeHome: null,
        halfTimeAway: null,
        winner: "home",
      },
    ]);
    await synchronizeGroupTeams(
      "VL",
      COMPETITION,
      SEASON,
      [team({ startingPoints: 0, points: 3 })],
      [
        level({ groupId: 2, level: 1, label: "Kultaa" }),
        level({ level: 2, teamCount: 1, label: "Karsintasarjaan" }),
        level({ level: 1, teamCount: 1, label: "Mestaruussarjaan" }),
      ]
    );
    await synchronizeGroupLevels("M1", COMPETITION, SEASON, [level({ categoryId: "M1" })]);

    // A finished season with rows stored is never refetched.
    const result = await getSeasonStandings("VL", COMPETITION, SEASON, SEASON + 1, undefined);

    expect(result.status === "ok" && result.levels).toEqual([
      { groupId: 1, level: 1, teamCount: 1, label: "Mestaruussarjaan" },
      { groupId: 1, level: 2, teamCount: 1, label: "Karsintasarjaan" },
      { groupId: 2, level: 1, teamCount: 1, label: "Kultaa" },
    ]);
    expect(getSeasonGroups).not.toHaveBeenCalled();
  });
});

describe("the zone backfill", () => {
  async function teamRows() {
    return await db
      .select()
      .from(tasoGroupTeams)
      .where(inArray(tasoGroupTeams.seasonId, SEASONS))
      .orderBy(asc(tasoGroupTeams.id));
  }

  it("writes the levels of a stored season, changes no team row, and reports a season it could not read", async () => {
    await synchronizeGroupTeams("VL", COMPETITION, SEASON, [team()], []);
    await synchronizeGroupTeams(
      "VL",
      OTHER_COMPETITION,
      OTHER_SEASON,
      [team({ competitionCode: OTHER_COMPETITION, seasonId: OTHER_SEASON })],
      [level({ competitionCode: OTHER_COMPETITION, seasonId: OTHER_SEASON, label: "Vanha" })]
    );
    const before = await teamRows();
    expect(before).toHaveLength(2);

    // TASO now serves the stored season's table at zero, with its levels; the
    // other season fails, as does any season another test left in the database.
    vi.mocked(getSeasonGroups).mockImplementation(async (competitionId, categoryId) => {
      if (competitionId !== COMPETITION || categoryId !== "VL") {
        throw new Error("TASO request failed with status 500");
      }
      return [
        {
          group_id: "1",
          next_stage_levels: "1,0,2,0,0,0,0,0,0,0",
          next_stage_level_texts: ["Kultaa", "", " Putoaa ", "", "", "", "", "", "", ""],
          teams: [{ team_id: "9301", team_name: "Zone United", points: 0, matches_played: 0 }],
        },
      ];
    });
    const lines: string[] = [];

    const result = await backfillZones(
      (work) => work(),
      (line) => lines.push(line)
    );

    expect(await storedLevels()).toEqual([
      ["VL", 1, 1, 1, "Kultaa"],
      ["VL", 1, 3, 2, "Putoaa"],
    ]);
    expect(await teamRows()).toEqual(before);
    // The season that could not be read keeps what it had, and is named.
    expect(await storedLevels(OTHER_SEASON)).toEqual([["VL", 1, 1, 1, "Vanha"]]);
    expect(result.failed).toContain(`VL ${OTHER_SEASON}`);
    expect(result.failed).not.toContain(`VL ${SEASON}`);
    expect(lines).toContain(`  VL ${SEASON}: 2 levels`);
    expect(lines).toContain(`  VL ${OTHER_SEASON}: FAILED — TASO request failed with status 500`);
  });

  it("takes a failed season up again on the next run", async () => {
    await synchronizeGroupTeams("VL", COMPETITION, SEASON, [team()], []);
    vi.mocked(getSeasonGroups).mockRejectedValue(new Error("TASO request failed with status 500"));
    await backfillZones(
      (work) => work(),
      () => undefined
    );
    expect(await storedLevels()).toEqual([]);

    vi.mocked(getSeasonGroups).mockImplementation(async (competitionId) => {
      if (competitionId !== COMPETITION) throw new Error("TASO request failed with status 500");
      return [
        {
          group_id: "1",
          next_stage_levels: "2,0,0,0,0,0,0,0,0,0",
          next_stage_level_texts: ["Nousee"],
        },
      ];
    });
    const result = await backfillZones(
      (work) => work(),
      () => undefined
    );

    expect(result.failed).not.toContain(`VL ${SEASON}`);
    expect(await storedLevels()).toEqual([["VL", 1, 1, 2, "Nousee"]]);
  });
});
