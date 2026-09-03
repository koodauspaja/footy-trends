import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { getTeamContext } from "@/lib/team-context";

/**
 * The resolution query against a real Postgres: which stored match decides a
 * team page's competition and season, and which rows a route may not resolve
 * from. See specs/020-context-free-team-page.md.
 */
const TEAM = 992101;
const OTHER = 992102;

const TASO_IDS = [992001, 992002, 992003, 992004];
const FD_IDS = [992001, 992002, 992003];

function tasoRow(overrides: Partial<typeof tasoMatches.$inferInsert> = {}) {
  return {
    providerMatchId: 992001,
    competitionCode: "spljp90",
    categoryId: "VL",
    seasonId: 990990,
    groupId: 1,
    groupName: "Mestaruussarja",
    kickoffAt: new Date("2026-08-01T15:00:00Z"),
    matchday: 1,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: TEAM,
    homeTeamName: "Integration VPS",
    awayTeamProviderId: OTHER,
    awayTeamName: "Integration Lahti",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

function footballDataRow(overrides: Partial<typeof matches.$inferInsert> = {}) {
  return {
    providerMatchId: 992001,
    competitionCode: "PL",
    seasonId: 990990,
    kickoffAt: new Date("2026-08-01T15:00:00Z"),
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
    homeTeamName: "Integration United",
    awayTeamProviderId: OTHER,
    awayTeamName: "Integration City",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

async function clearFixtures() {
  await db.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, TASO_IDS));
  await db.delete(matches).where(inArray(matches.providerMatchId, FD_IDS));
}

beforeEach(clearFixtures);
afterEach(clearFixtures);

describe("resolving a team's own context", () => {
  it("takes the competition and season of the newest stored match", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 992001, categoryId: "VL", seasonId: 990990 }),
      tasoRow({
        providerMatchId: 992002,
        categoryId: "M2",
        seasonId: 990991,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
    ]);

    expect(await getTeamContext({ kind: "taso", bucket: "domestic" }, TEAM)).toEqual({
      status: "ok",
      context: { competitionCode: "M2", seasonId: 990991 },
    });
  });

  it("resolves a team that was the away side", async () => {
    await db
      .insert(tasoMatches)
      .values(tasoRow({ homeTeamProviderId: OTHER, awayTeamProviderId: TEAM, categoryId: "M1" }));

    expect(await getTeamContext({ kind: "taso", bucket: "domestic" }, TEAM)).toEqual({
      status: "ok",
      context: { competitionCode: "M1", seasonId: 990990 },
    });
  });

  it("narrows to the newest season within a competition the URL named", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 992001, categoryId: "VL", seasonId: 990990 }),
      tasoRow({
        providerMatchId: 992002,
        categoryId: "M2",
        seasonId: 990991,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
    ]);

    expect(
      await getTeamContext({ kind: "taso", bucket: "domestic" }, TEAM, { competitionCode: "VL" })
    ).toEqual({ status: "ok", context: { competitionCode: "VL", seasonId: 990990 } });
  });

  it("takes the competition of the newest match within a season the URL named", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 992001, categoryId: "VL", seasonId: 990990 }),
      tasoRow({
        providerMatchId: 992002,
        categoryId: "MSC",
        seasonId: 990990,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
    ]);

    expect(
      await getTeamContext({ kind: "taso", bucket: "domestic" }, TEAM, { seasonId: 990990 })
    ).toEqual({ status: "ok", context: { competitionCode: "MSC", seasonId: 990990 } });
  });

  it("does not resolve a /kotimaa team page from a national-team row", async () => {
    await db
      .insert(tasoMatches)
      .values(tasoRow({ competitionCode: "maajp2026", categoryId: "VL" }));

    expect(await getTeamContext({ kind: "taso", bucket: "domestic" }, TEAM)).toEqual({
      status: "not_found",
    });
  });

  it("ignores a row whose category no competition in the picker claims", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 992001, categoryId: "VL", seasonId: 990990 }),
      tasoRow({
        providerMatchId: 992002,
        categoryId: "X99",
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
    ]);

    expect(await getTeamContext({ kind: "taso", bucket: "domestic" }, TEAM)).toEqual({
      status: "ok",
      context: { competitionCode: "VL", seasonId: 990990 },
    });
  });

  it("breaks a tie on kickoff deterministically", async () => {
    const kickoffAt = new Date("2026-09-01T15:00:00Z");
    await db
      .insert(tasoMatches)
      .values([
        tasoRow({ providerMatchId: 992001, categoryId: "VL", kickoffAt }),
        tasoRow({ providerMatchId: 992002, categoryId: "M2", kickoffAt }),
      ]);

    // The higher provider id wins, every time it is asked.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await getTeamContext({ kind: "taso", bucket: "domestic" }, TEAM)).toEqual({
        status: "ok",
        context: { competitionCode: "M2", seasonId: 990990 },
      });
    }
  });

  it("resolves a foreign team, and not from another region's competition", async () => {
    await db.insert(matches).values([
      footballDataRow({ providerMatchId: 992001, competitionCode: "BL1" }),
      footballDataRow({
        providerMatchId: 992002,
        competitionCode: "WC",
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
    ]);

    expect(await getTeamContext({ kind: "football-data", region: "foreign" }, TEAM)).toEqual({
      status: "ok",
      context: { competitionCode: "BL1", seasonId: 990990 },
    });
    expect(await getTeamContext({ kind: "football-data", region: "national-teams" }, TEAM)).toEqual(
      {
        status: "ok",
        context: { competitionCode: "WC", seasonId: 990990 },
      }
    );
  });

  it("answers not_found for a team with nothing stored", async () => {
    expect(await getTeamContext({ kind: "taso", bucket: "domestic" }, 992999)).toEqual({
      status: "not_found",
    });
  });
});
