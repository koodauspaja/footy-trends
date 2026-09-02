import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { getTeamName, getTeamSeasons } from "@/lib/team-seasons";

/**
 * The grouped query against a real Postgres: which competitions and seasons a
 * club has matches for, and in what order the selector receives them. See
 * specs/022-teams-between-tiers.md.
 */
const TEAM = 993101;
const OTHER = 993102;
const TASO_IDS = [993001, 993002, 993003, 993004, 993005];
const FD_IDS = [993001, 993002];

function tasoRow(overrides: Partial<typeof tasoMatches.$inferInsert> = {}) {
  return {
    providerMatchId: 993001,
    competitionCode: "spljp90",
    categoryId: "VL",
    seasonId: 990801,
    groupId: 1,
    groupName: "Runkosarja",
    kickoffAt: new Date("2026-05-01T15:00:00Z"),
    matchday: 1,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: TEAM,
    homeTeamName: "Integration Haka",
    awayTeamProviderId: OTHER,
    awayTeamName: "Integration KuPS",
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

function footballDataRow(overrides: Partial<typeof matches.$inferInsert> = {}) {
  return {
    providerMatchId: 993001,
    competitionCode: "PL",
    seasonId: 990801,
    kickoffAt: new Date("2026-05-01T15:00:00Z"),
    matchday: 1,
    status: "FINISHED",
    stage: "REGULAR_SEASON",
    groupName: null,
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    homeTeamProviderId: TEAM,
    homeTeamName: "Integration Burnley",
    awayTeamProviderId: OTHER,
    awayTeamName: "Integration Arsenal",
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

async function clearFixtures() {
  await db.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, TASO_IDS));
  await db.delete(matches).where(inArray(matches.providerMatchId, FD_IDS));
}

beforeEach(clearFixtures);
afterEach(clearFixtures);

describe("a club's own seasons", () => {
  it("returns every competition and season it played, newest first", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 993001, categoryId: "VL", seasonId: 990800 }),
      tasoRow({
        providerMatchId: 993002,
        categoryId: "M1L",
        seasonId: 990801,
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
      }),
    ]);

    const result = await getTeamSeasons({ kind: "taso", bucket: "domestic" }, TEAM);

    expect(result).toEqual({
      status: "ok",
      seasons: [
        { competitionCode: "M1L", seasonId: 990801, matches: 1 },
        { competitionCode: "VL", seasonId: 990800, matches: 1 },
      ],
    });
  });

  it("puts the competition with more matches first within a season", async () => {
    // A league season beats a cup run, which is what the selector lands on.
    await db
      .insert(tasoMatches)
      .values([
        tasoRow({ providerMatchId: 993001, categoryId: "MSC" }),
        tasoRow({ providerMatchId: 993002, categoryId: "VL" }),
        tasoRow({ providerMatchId: 993003, categoryId: "VL" }),
      ]);

    const result = await getTeamSeasons({ kind: "taso", bucket: "domestic" }, TEAM);

    if (result.status !== "ok") throw new Error("expected seasons");
    expect(result.seasons.map((season) => `${season.competitionCode}:${season.matches}`)).toEqual([
      "VL:2",
      "MSC:1",
    ]);
  });

  it("finds a club that was the away side", async () => {
    await db
      .insert(tasoMatches)
      .values(tasoRow({ homeTeamProviderId: OTHER, awayTeamProviderId: TEAM }));

    expect(await getTeamName({ kind: "taso", bucket: "domestic" }, TEAM)).toEqual({
      status: "ok",
      name: "Integration KuPS",
    });
  });

  it("ignores the national-team buckets that share the table", async () => {
    await db.insert(tasoMatches).values(tasoRow({ competitionCode: "maajp2026" }));

    expect(await getTeamSeasons({ kind: "taso", bucket: "domestic" }, TEAM)).toEqual({
      status: "not_found",
    });
  });

  it("keeps a foreign club's competitions inside its own region", async () => {
    await db
      .insert(matches)
      .values([
        footballDataRow({ providerMatchId: 993001, competitionCode: "PL", seasonId: 990801 }),
        footballDataRow({ providerMatchId: 993002, competitionCode: "WC", seasonId: 990800 }),
      ]);

    const result = await getTeamSeasons({ kind: "football-data", region: "foreign" }, TEAM);

    if (result.status !== "ok") throw new Error("expected seasons");
    expect(result.seasons).toEqual([{ competitionCode: "PL", seasonId: 990801, matches: 1 }]);
  });

  it("answers not_found for a club with nothing stored", async () => {
    expect(await getTeamSeasons({ kind: "taso", bucket: "domestic" }, 993999)).toEqual({
      status: "not_found",
    });
  });
});
