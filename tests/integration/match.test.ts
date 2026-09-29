import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import {
  getCompetitionAverages,
  getHeadToHeadHistory,
  getMatchPageData,
  getWorstOpponents,
} from "@/lib/match-service";

/**
 * The match page's two queries against a real Postgres — the lookup by provider
 * id, and the head-to-head selection whose every clause is a decision in
 * specs/019-match-page.md.
 *
 * Fixture ids are far above anything either provider issues, and are deleted
 * either side of every test.
 */
const HOME = 991101;
const AWAY = 991102;
const OTHER = 991103;
// Distinct from the standings suite's own fixtures, which share these tables.
const SEASON = 991777;

const TASO_IDS = [
  991001, 991002, 991003, 991004, 991005, 991006, 991007, 991008, 991009, 991010, 991011, 991012,
  991013, 991014, 991015, 991016, 991017,
];
const FD_IDS = [991001, 991002, 991003, 991004];

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

/**
 * The full history behind specs/042, against the real schema.
 *
 * What it must differ from the block above in, and only in: no anchor, no
 * limit, and no exclusion of the match linked from.
 */
describe("the head-to-head history", () => {
  const DOMESTIC = { kind: "taso", bucket: "domestic" } as const;

  it("returns every meeting, both orientations, newest first and uncapped", async () => {
    await db.insert(tasoMatches).values(
      [0, 1, 2, 3, 4, 5, 6, 7].map((offset) =>
        tasoRow({
          providerMatchId: 991001 + offset,
          kickoffAt: new Date(`2026-0${offset + 1}-01T15:00:00Z`),
          homeTeamProviderId: offset % 2 === 0 ? AWAY : HOME,
          awayTeamProviderId: offset % 2 === 0 ? HOME : AWAY,
        })
      )
    );

    const result = await getHeadToHeadHistory(DOMESTIC, HOME, AWAY);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Eight, not the five `HEAD_TO_HEAD_LIMIT` caps the match page at.
    expect(result.matches).toHaveLength(8);
    expect(result.matches.map((row) => row.providerMatchId)).toEqual([
      991008, 991007, 991006, 991005, 991004, 991003, 991002, 991001,
    ]);
  });

  it("includes a meeting played after the one a reader arrived from", async () => {
    // The match page anchors on its own kickoff because it is context for that
    // fixture. A history of the pair is not (specs/042, S4).
    await db
      .insert(tasoMatches)
      .values([
        tasoRow({ providerMatchId: 991001, kickoffAt: new Date("2026-06-01T15:00:00Z") }),
        tasoRow({ providerMatchId: 991002, kickoffAt: new Date("2026-09-01T15:00:00Z") }),
      ]);

    const result = await getHeadToHeadHistory(DOMESTIC, HOME, AWAY);

    if (result.status !== "ok") throw new Error("no result");
    expect(result.matches.map((row) => row.providerMatchId)).toEqual([991002, 991001]);
  });

  it("returns no unplayed fixture, so nothing on the page describes one", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 991001, kickoffAt: new Date("2026-06-01T15:00:00Z") }),
      tasoRow({
        providerMatchId: 991002,
        kickoffAt: new Date("2027-06-01T15:00:00Z"),
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
      }),
    ]);

    const result = await getHeadToHeadHistory(DOMESTIC, HOME, AWAY);

    if (result.status !== "ok") throw new Error("no result");
    expect(result.matches.map((row) => row.providerMatchId)).toEqual([991001]);
  });

  it("leaves out a third team's matches", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 991001, kickoffAt: new Date("2026-06-01T15:00:00Z") }),
      tasoRow({
        providerMatchId: 991003,
        kickoffAt: new Date("2026-05-01T15:00:00Z"),
        awayTeamProviderId: OTHER,
        awayTeamName: "Integration Third",
      }),
    ]);

    const result = await getHeadToHeadHistory(DOMESTIC, HOME, AWAY);

    if (result.status !== "ok") throw new Error("no result");
    expect(result.matches.map((row) => row.providerMatchId)).toEqual([991001]);
  });

  it("has no history for a team against itself", async () => {
    expect(await getHeadToHeadHistory(DOMESTIC, HOME, HOME)).toEqual({ status: "unavailable" });
  });

  it("gives the match page the count the page will show, so the link cannot disagree", async () => {
    // The match page lists only meetings before its own kickoff, but its link
    // counts the whole history: here that includes a meeting played since.
    await db
      .insert(tasoMatches)
      .values([
        tasoRow({ providerMatchId: 991001, kickoffAt: new Date("2026-06-01T15:00:00Z") }),
        tasoRow({ providerMatchId: 991002, kickoffAt: new Date("2026-07-01T15:00:00Z") }),
        tasoRow({ providerMatchId: 991003, kickoffAt: new Date("2026-08-01T15:00:00Z") }),
      ]);

    const page = await getMatchPageData(DOMESTIC, 991002);
    const history = await getHeadToHeadHistory(DOMESTIC, HOME, AWAY);

    if (page.status !== "ok" || page.headToHead.status !== "ok") throw new Error("no page");
    if (history.status !== "ok") throw new Error("no history");
    expect(page.headToHead.matches.map((row) => row.providerMatchId)).toEqual([991001]);
    expect(page.headToHead.total).toBe(history.matches.length);
    expect(page.headToHead.total).toBe(3);
  });
});

describe("the competition averages (specs/044)", () => {
  it("averages exactly the football-data seasons given, finished matches only", async () => {
    await db.insert(matches).values([
      footballDataRow({ providerMatchId: 991001, homeGoals: 3, awayGoals: 1 }),
      footballDataRow({ providerMatchId: 991002, homeGoals: 0, awayGoals: 0 }),
      // Another season of the same competition: outside the scope (S7).
      footballDataRow({
        providerMatchId: 991003,
        seasonId: SEASON + 1,
        homeGoals: 9,
        awayGoals: 9,
      }),
      // Unplayed: no score to average.
      footballDataRow({
        providerMatchId: 991004,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
      }),
    ]);

    const result = await getCompetitionAverages([
      { scope: { kind: "football-data", competitionCode: "PL", seasonIds: [SEASON] } },
    ]);

    expect(result).toEqual({
      status: "ok",
      rows: [
        {
          scope: { kind: "football-data", competitionCode: "PL", seasonIds: [SEASON] },
          competition: { home: 1.5, away: 0.5 },
        },
      ],
    });
  });

  it("averages exactly the TASO competition-seasons given, across category ids", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({
        providerMatchId: 991010,
        competitionCode: "Liigacup90",
        categoryId: "LC",
        homeGoals: 2,
        awayGoals: 2,
      }),
      tasoRow({
        providerMatchId: 991011,
        competitionCode: "Liigacup89",
        categoryId: "LC2023",
        homeGoals: 0,
        awayGoals: 1,
      }),
      // The same season, another competition inside it: outside the scope.
      tasoRow({
        providerMatchId: 991012,
        competitionCode: "Liigacup90",
        categoryId: "M1LCUP",
        homeGoals: 7,
        awayGoals: 7,
      }),
    ]);

    const result = await getCompetitionAverages([
      {
        scope: {
          kind: "taso",
          seasons: [
            { competitionId: "Liigacup90", categoryId: "LC" },
            { competitionId: "Liigacup89", categoryId: "LC2023" },
          ],
        },
      },
    ]);

    expect(result.status === "ok" ? result.rows[0]?.competition : null).toEqual({
      home: 1,
      away: 1.5,
    });
  });

  it("fails rather than answer 0,0 – 0,0 for a scope with no finished match", async () => {
    const result = await getCompetitionAverages([
      { scope: { kind: "football-data", competitionCode: "PL", seasonIds: [SEASON] } },
    ]);

    expect(result).toEqual({ status: "error" });
  });
});

describe("a club's worst opponents (specs/045)", () => {
  it("reads both orientations, finished matches only, inside the club's own bucket", async () => {
    await db.insert(tasoMatches).values([
      // Three losses to AWAY, two at home and one away: one opponent, 0 points.
      tasoRow({ providerMatchId: 991013, homeGoals: 0, awayGoals: 1 }),
      tasoRow({ providerMatchId: 991014, homeGoals: 1, awayGoals: 2 }),
      tasoRow({
        providerMatchId: 991015,
        homeTeamProviderId: AWAY,
        homeTeamName: "Integration Lahti",
        awayTeamProviderId: HOME,
        awayTeamName: "Integration VPS",
        homeGoals: 3,
        awayGoals: 0,
      }),
      // In progress, with a score so far: not a result yet, so not a fourth
      // meeting. The status is what excludes it — the score filter would not.
      tasoRow({ providerMatchId: 991016, status: "IN_PLAY", homeGoals: 0, awayGoals: 5 }),
      // The national bucket shares the table: never a domestic club's opponent.
      tasoRow({ providerMatchId: 991017, competitionCode: "maajp90", homeGoals: 0, awayGoals: 9 }),
    ]);

    const series = await getWorstOpponents({ kind: "taso", bucket: "domestic" }, HOME, "/kotimaa");

    expect(series).toMatchObject({
      status: "ok",
      rows: [
        {
          opponentProviderId: AWAY,
          played: 3,
          wins: 0,
          draws: 0,
          losses: 3,
          pointsPerMatch: 0,
          href: `/kotimaa/kohtaamiset/${HOME}/${AWAY}`,
        },
      ],
    });
  });

  it("agrees with the head-to-head page for the same pair (S4)", async () => {
    await db
      .insert(tasoMatches)
      .values([
        tasoRow({ providerMatchId: 991013, homeGoals: 2, awayGoals: 2 }),
        tasoRow({ providerMatchId: 991014, homeGoals: 0, awayGoals: 1 }),
        tasoRow({ providerMatchId: 991015, homeGoals: 3, awayGoals: 1 }),
      ]);

    const series = await getWorstOpponents({ kind: "taso", bucket: "domestic" }, HOME, "/kotimaa");
    const history = await getHeadToHeadHistory({ kind: "taso", bucket: "domestic" }, HOME, AWAY);

    expect(history.status === "ok" ? history.matches.length : -1).toBe(3);
    expect(series.status === "ok" ? series.rows[0]?.played : -1).toBe(3);
  });
});
