import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { getMatchPageData } from "@/lib/match-service";

/**
 * The match page's two queries against a real Postgres — the lookup by provider
 * id, and the head-to-head selection whose every clause is a decision in
 * specs/019-match-page.md.
 *
 * Fixture ids are far above anything either provider issues, and are deleted
 * either side of every test.
 */
const HOME = 990101;
const AWAY = 990102;
const OTHER = 990103;
// Distinct from the standings suite's own fixtures, which share these tables.
const SEASON = 990777;

const TASO_IDS = [991001, 991002, 991003, 991004, 991005, 991006, 991007, 991008, 991009];
const FD_IDS = [991001, 991002, 991003];

function tasoRow(overrides: Partial<typeof tasoMatches.$inferInsert> = {}) {
  return {
    providerMatchId: 991001,
    competitionCode: "spljp90",
    categoryId: "VL",
    seasonId: SEASON,
    groupId: 1,
    groupName: "Mestaruussarja",
    kickoffAt: new Date("2026-08-01T15:00:00Z"),
    matchday: 1,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: HOME,
    homeTeamName: "Integration VPS",
    awayTeamProviderId: AWAY,
    awayTeamName: "Integration Lahti",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

function footballDataRow(overrides: Partial<typeof matches.$inferInsert> = {}) {
  return {
    providerMatchId: 991001,
    competitionCode: "PL",
    seasonId: SEASON,
    kickoffAt: new Date("2026-08-01T15:00:00Z"),
    matchday: 1,
    status: "FINISHED",
    stage: null,
    groupName: null,
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    homeTeamProviderId: HOME,
    homeTeamName: "Integration United",
    awayTeamProviderId: AWAY,
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

describe("the match lookup", () => {
  it("finds a TASO match by its provider id", async () => {
    await db.insert(tasoMatches).values(tasoRow());

    const result = await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991001);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.match.match.homeTeamName).toBe("Integration VPS");
  });

  it("does not find a national-team match under /kotimaa", async () => {
    // The two buckets share one table, and the predicate is what separates them.
    await db.insert(tasoMatches).values(tasoRow({ competitionCode: "maajp2026" }));

    const result = await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991001);

    expect(result.status).toBe("not_found");
  });

  it("finds a Ykkösliigacup match under /kotimaa, which is not a spljp bucket", async () => {
    await db
      .insert(tasoMatches)
      .values(tasoRow({ competitionCode: "M1LCUP26", categoryId: "M1LCUP" }));

    const result = await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991001);

    expect(result.status).toBe("ok");
  });

  it("does not find a foreign match under /maajoukkueet", async () => {
    await db.insert(matches).values(footballDataRow());

    const result = await getMatchPageData(
      { kind: "football-data", region: "national-teams" },
      991001
    );

    expect(result.status).toBe("not_found");
  });

  it("answers not_found for an id nothing stored", async () => {
    expect(await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991999)).toEqual({
      status: "not_found",
    });
  });
});

describe("the head-to-head selection", () => {
  it("returns both orientations, newest first, and at most five", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 991001, kickoffAt: new Date("2026-08-01T15:00:00Z") }),
      // Seven earlier meetings, alternating which side was at home.
      ...[1, 2, 3, 4, 5, 6, 7].map((offset) =>
        tasoRow({
          providerMatchId: 991001 + offset,
          kickoffAt: new Date(`2026-0${offset}-01T15:00:00Z`),
          homeTeamProviderId: offset % 2 === 0 ? AWAY : HOME,
          awayTeamProviderId: offset % 2 === 0 ? HOME : AWAY,
        })
      ),
    ]);

    const result = await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991001);

    expect(result.status).toBe("ok");
    if (result.status !== "ok" || result.headToHead.status !== "ok") return;
    expect(result.headToHead.matches).toHaveLength(5);
    expect(result.headToHead.matches.map((row) => row.providerMatchId)).toEqual([
      991008, 991007, 991006, 991005, 991004,
    ]);
  });

  it("excludes the match itself, a later meeting, and a third team's match", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 991001, kickoffAt: new Date("2026-06-01T15:00:00Z") }),
      tasoRow({ providerMatchId: 991002, kickoffAt: new Date("2026-09-01T15:00:00Z") }),
      tasoRow({
        providerMatchId: 991003,
        kickoffAt: new Date("2026-05-01T15:00:00Z"),
        awayTeamProviderId: OTHER,
        awayTeamName: "Integration Third",
      }),
      tasoRow({ providerMatchId: 991004, kickoffAt: new Date("2026-04-01T15:00:00Z") }),
    ]);

    const result = await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991001);

    if (result.status !== "ok" || result.headToHead.status !== "ok") throw new Error("no result");
    expect(result.headToHead.matches.map((row) => row.providerMatchId)).toEqual([991004]);
  });

  it("excludes a meeting that was never played", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 991001, kickoffAt: new Date("2026-06-01T15:00:00Z") }),
      tasoRow({
        providerMatchId: 991002,
        kickoffAt: new Date("2026-05-01T15:00:00Z"),
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
      }),
    ]);

    const result = await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991001);

    if (result.status !== "ok" || result.headToHead.status !== "ok") throw new Error("no result");
    expect(result.headToHead.matches).toEqual([]);
  });

  it("does not cross the bucket boundary inside the shared TASO table", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 991001, kickoffAt: new Date("2026-06-01T15:00:00Z") }),
      tasoRow({
        providerMatchId: 991002,
        kickoffAt: new Date("2026-05-01T15:00:00Z"),
        competitionCode: "maajp2026",
      }),
    ]);

    const result = await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991001);

    if (result.status !== "ok" || result.headToHead.status !== "ok") throw new Error("no result");
    expect(result.headToHead.matches).toEqual([]);
  });

  it("skips the head-to-head entirely for an unresolved bracket slot", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 991001, homeTeamProviderId: 0, homeTeamName: "" }),
      tasoRow({
        providerMatchId: 991002,
        kickoffAt: new Date("2026-05-01T15:00:00Z"),
        homeTeamProviderId: 0,
        homeTeamName: "",
      }),
    ]);

    const result = await getMatchPageData({ kind: "taso", bucket: "domestic" }, 991001);

    if (result.status !== "ok") throw new Error("no result");
    expect(result.headToHead.status).toBe("unavailable");
  });

  it("spans competitions inside one football-data region", async () => {
    await db.insert(matches).values([
      footballDataRow({ providerMatchId: 991001, kickoffAt: new Date("2026-06-01T15:00:00Z") }),
      footballDataRow({
        providerMatchId: 991002,
        competitionCode: "CL",
        kickoffAt: new Date("2026-05-01T15:00:00Z"),
      }),
      // Another region's competition, which must not appear.
      footballDataRow({
        providerMatchId: 991003,
        competitionCode: "WC",
        kickoffAt: new Date("2026-04-01T15:00:00Z"),
      }),
    ]);

    const result = await getMatchPageData({ kind: "football-data", region: "foreign" }, 991001);

    if (result.status !== "ok" || result.headToHead.status !== "ok") throw new Error("no result");
    expect(result.headToHead.matches.map((row) => row.providerMatchId)).toEqual([991002]);
  });
});
