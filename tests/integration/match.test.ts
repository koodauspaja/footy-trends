import { inArray, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { headToHeadRecord } from "@/lib/head-to-head";
import {
  FOOTBALL_DATA_AWAY_GOALS,
  FOOTBALL_DATA_HOME_GOALS,
  getCompetitionAverages,
  getGoalsPerGame,
  getHeadToHeadHistory,
  getHomeBaseline,
  getMatchPageData,
  getOutcomeShares,
  getTeamForm,
  getWorstOpponents,
  type TasoMatchRow,
} from "@/lib/match-service";
import { toFinishedMatches } from "@/lib/standings";

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
  991013, 991014, 991015, 991016, 991017, 991018, 991019, 991020, 991021, 991022, 991023, 991024,
];
const FD_IDS = Array.from({ length: 16 }, (_, index) => 991001 + index);

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

describe("a football-data score without its shoot-out (#528, specs/049 S3)", () => {
  it("is the same from SQL as from the tables' own rule, half a shoot-out included", async () => {
    const rows = [
      // Both sides stored: 0–0 after extra time.
      footballDataRow({ providerMatchId: 991001, penaltiesHome: 3, penaltiesAway: 4 }),
      // Half a shoot-out is not one: the score stays as stored.
      footballDataRow({ providerMatchId: 991002, penaltiesHome: 3, penaltiesAway: null }),
      footballDataRow({ providerMatchId: 991003, penaltiesHome: null, penaltiesAway: 4 }),
      footballDataRow({ providerMatchId: 991004 }),
    ].map((row) => ({ ...row, homeGoals: 3, awayGoals: 4 }));
    await db.insert(matches).values(rows);

    const fromSql = await db
      .select({
        providerMatchId: matches.providerMatchId,
        homeGoals: sql<number>`${FOOTBALL_DATA_HOME_GOALS}`.mapWith(Number),
        awayGoals: sql<number>`${FOOTBALL_DATA_AWAY_GOALS}`.mapWith(Number),
      })
      .from(matches)
      .where(inArray(matches.providerMatchId, FD_IDS))
      .orderBy(matches.providerMatchId);

    expect(fromSql).toEqual([
      { providerMatchId: 991001, homeGoals: 0, awayGoals: 0 },
      { providerMatchId: 991002, homeGoals: 3, awayGoals: 4 },
      { providerMatchId: 991003, homeGoals: 3, awayGoals: 4 },
      { providerMatchId: 991004, homeGoals: 3, awayGoals: 4 },
    ]);
    // The other path: the stored rows, through the rule the tables use.
    const stored = await db
      .select()
      .from(matches)
      .where(inArray(matches.providerMatchId, FD_IDS))
      .orderBy(matches.providerMatchId);
    expect(fromSql).toEqual(
      toFinishedMatches(stored).map(({ providerMatchId, homeGoals, awayGoals }) => ({
        providerMatchId,
        homeGoals,
        awayGoals,
      }))
    );
  });

  it("counts a half-stored shoot-out's whole score in the goals per game", async () => {
    await db.insert(matches).values([
      footballDataRow({
        providerMatchId: 991001,
        homeGoals: 3,
        awayGoals: 4,
        penaltiesHome: 3,
        penaltiesAway: null,
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
          competition: { home: 3, away: 4 },
        },
      ],
    });
  });
});

describe("the competition averages (specs/044)", () => {
  it("averages exactly the football-data seasons given, finished matches only", async () => {
    await db.insert(matches).values([
      footballDataRow({ providerMatchId: 991001, homeGoals: 3, awayGoals: 1 }),
      // A 0–0 settled on penalties, stored with the shoot-out in it (#492):
      // its goals are 0–0.
      footballDataRow({
        providerMatchId: 991002,
        homeGoals: 3,
        awayGoals: 4,
        penaltiesHome: 3,
        penaltiesAway: 4,
      }),
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
    await db.insert(tasoMatches).values([
      tasoRow({ providerMatchId: 991013, homeGoals: 2, awayGoals: 2 }),
      tasoRow({ providerMatchId: 991014, homeGoals: 0, awayGoals: 1 }),
      tasoRow({ providerMatchId: 991015, homeGoals: 3, awayGoals: 1 }),
      // Away at AWAY, won 2-0: HOME's second win, read from the other side.
      tasoRow({
        providerMatchId: 991016,
        homeTeamProviderId: AWAY,
        homeTeamName: "Integration Lahti",
        awayTeamProviderId: HOME,
        awayTeamName: "Integration VPS",
        homeGoals: 0,
        awayGoals: 2,
      }),
    ]);

    const series = await getWorstOpponents({ kind: "taso", bucket: "domestic" }, HOME, "/kotimaa");
    const history = await getHeadToHeadHistory({ kind: "taso", bucket: "domestic" }, HOME, AWAY);
    // The page's own record, from the page's own read — not just its length
    // (Sourcery, on #478): a swapped side keeps the count and changes this.
    const record =
      history.status === "ok"
        ? headToHeadRecord(toFinishedMatches(history.matches as TasoMatchRow[]), HOME)
        : null;
    const [row] = series.status === "ok" ? series.rows : [];

    // Two wins, a draw and a loss from HOME's side: wins and losses differ, so
    // a record read from the wrong side cannot match.
    expect(record).toMatchObject({ played: 4, wins: 2, draws: 1, losses: 1 });
    expect(row && [row.played, row.wins, row.draws, row.losses]).toEqual(
      record && [record.played, record.wins, record.draws, record.losses]
    );
  });
});

describe("a team's latest form (specs/047)", () => {
  /** A finished match for HOME on `day` of September 2026, home or away. */
  function played(
    id: number,
    day: number,
    homeTeam: number,
    own: number,
    other: number,
    extra = {}
  ) {
    const homeIsHome = homeTeam === HOME;
    return tasoRow({
      providerMatchId: id,
      kickoffAt: new Date(Date.UTC(2026, 8, day, 15)),
      homeTeamProviderId: homeIsHome ? HOME : OTHER,
      homeTeamName: homeIsHome ? "Integration VPS" : "Integration Other",
      awayTeamProviderId: homeIsHome ? OTHER : HOME,
      awayTeamName: homeIsHome ? "Integration Other" : "Integration VPS",
      homeGoals: homeIsHome ? own : other,
      awayGoals: homeIsHome ? other : own,
      ...extra,
    });
  }

  it("reads the latest five, home and away, across competitions, finished only", async () => {
    await db.insert(tasoMatches).values([
      // The oldest: one too many, so it must fall out of the five.
      played(991018, 1, HOME, 0, 3),
      played(991019, 5, HOME, 2, 0),
      played(991020, 9, OTHER, 1, 1),
      // Another competition in the same bucket: counted (S5).
      played(991021, 12, HOME, 0, 1, { categoryId: "MSC", competitionCode: "spljp90" }),
      played(991022, 15, OTHER, 3, 2),
      played(991023, 19, HOME, 1, 0),
      // Newer, but in progress: not a result, so not in the five.
      played(991024, 25, HOME, 0, 4, { status: "IN_PLAY" }),
    ]);

    const form = await getTeamForm({ kind: "taso", bucket: "domestic" }, HOME);

    expect(form.status).toBe("ok");
    if (form.status !== "ok") return;
    expect(form.entries.map((entry) => entry.match.providerMatchId)).toEqual([
      991019, 991020, 991021, 991022, 991023,
    ]);
    expect(form.entries.map((entry) => entry.result)).toEqual(["V", "T", "H", "V", "V"]);
    // 3 + 1 + 0 + 3 + 3 = 10 over five.
    expect(form.pointsPerMatch).toBe(2);
    expect(form.latest).toEqual(new Date(Date.UTC(2026, 8, 19, 15)));
  });

  it("does not read the national bucket for a domestic team", async () => {
    await db
      .insert(tasoMatches)
      .values([
        played(991018, 1, HOME, 1, 0),
        played(991019, 2, HOME, 1, 0),
        played(991020, 3, HOME, 1, 0),
        played(991021, 4, HOME, 1, 0),
        played(991022, 5, HOME, 1, 0, { competitionCode: "maajp90" }),
      ]);

    await expect(getTeamForm({ kind: "taso", bucket: "domestic" }, HOME)).resolves.toEqual({
      status: "too-few",
    });
  });
});

describe("a competition's goals per game (specs/048)", () => {
  /**
   * Codes no provider uses, because this reads a competition's whole stored
   * history and the real ones hold other suites' fixtures. A code the registry
   * does not know reads as the `spljp{YY}` umbrella under its own category.
   */
  const FD_CODE = "ZZ48";
  const TASO_CODE = "ZZ48T";
  const umbrella = (season: number) => `spljp${String(season % 100).padStart(2, "0")}`;

  /** Five finished matches of one season, `goals` each: enough to draw (S8). */
  function fiveOf<T>(row: (id: number) => T, firstId: number): T[] {
    return Array.from({ length: 5 }, (_, index) => row(firstId + index));
  }

  it("counts every finished football-data match with both scores, playoffs included", async () => {
    await db.insert(matches).values([
      ...fiveOf(
        (id) =>
          footballDataRow({
            providerMatchId: id,
            competitionCode: FD_CODE,
            homeGoals: 2,
            awayGoals: 1,
          }),
        991001
      ),
      // A second stage of the same season is the same season (S6).
      footballDataRow({
        providerMatchId: 991006,
        competitionCode: FD_CODE,
        stage: "PLAYOFFS",
        // 0–0 settled on penalties, stored with the shoot-out in it: no goals
        // (#492).
        homeGoals: 4,
        awayGoals: 3,
        penaltiesHome: 4,
        penaltiesAway: 3,
      }),
      ...fiveOf(
        (id) =>
          footballDataRow({
            providerMatchId: id,
            competitionCode: FD_CODE,
            seasonId: SEASON + 1,
            homeGoals: 1,
            awayGoals: 1,
          }),
        991007
      ),
      // Unplayed, and a finished match without its score: neither counts (S1).
      footballDataRow({
        providerMatchId: 991012,
        competitionCode: FD_CODE,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
      }),
      footballDataRow({
        providerMatchId: 991013,
        competitionCode: FD_CODE,
        homeGoals: 5,
        awayGoals: null,
      }),
      // Another competition's match, the same season.
      footballDataRow({
        providerMatchId: 991014,
        competitionCode: "PL",
        homeGoals: 9,
        awayGoals: 9,
      }),
    ]);

    await expect(getGoalsPerGame("football-data", FD_CODE, SEASON + 1)).resolves.toMatchObject({
      status: "ok",
      points: [
        { seasonId: SEASON, matches: 6, perGame: 15 / 6, inProgress: false },
        { seasonId: SEASON + 1, matches: 5, perGame: 2, inProgress: true },
      ],
      leftOut: [],
    });
  });

  it("keeps each TASO season to its own competition and category", async () => {
    await db.insert(tasoMatches).values([
      ...fiveOf(
        (id) =>
          tasoRow({
            providerMatchId: id,
            competitionCode: umbrella(SEASON),
            categoryId: TASO_CODE,
            homeGoals: 3,
            awayGoals: 1,
          }),
        991001
      ),
      ...fiveOf(
        (id) =>
          tasoRow({
            providerMatchId: id,
            competitionCode: umbrella(SEASON + 1),
            seasonId: SEASON + 1,
            categoryId: TASO_CODE,
            homeGoals: 1,
            awayGoals: 0,
          }),
        991006
      ),
      // The same category under another competition that season — a cup
      // publishing under it — is not this league's match.
      tasoRow({
        providerMatchId: 991011,
        competitionCode: "Liigacup77",
        categoryId: TASO_CODE,
        homeGoals: 9,
        awayGoals: 9,
      }),
      // A later season with too few matches to draw: named, not drawn (S14).
      tasoRow({
        providerMatchId: 991012,
        competitionCode: umbrella(SEASON + 2),
        seasonId: SEASON + 2,
        categoryId: TASO_CODE,
      }),
      // Being played: a score so far, not a result (S1).
      tasoRow({
        providerMatchId: 991013,
        competitionCode: umbrella(SEASON),
        categoryId: TASO_CODE,
        status: "Live",
        homeGoals: 4,
        awayGoals: 4,
      }),
    ]);

    await expect(getGoalsPerGame("taso", TASO_CODE, SEASON + 2)).resolves.toMatchObject({
      status: "ok",
      points: [
        { seasonId: SEASON, matches: 5, perGame: 4 },
        { seasonId: SEASON + 1, matches: 5, perGame: 1 },
      ],
      leftOut: [SEASON + 2],
    });
  });
});

describe("the competitions' home advantage (specs/049)", () => {
  /**
   * The read spans every compared competition, which other suites' fixtures
   * share, so each test measures what its own rows add: counts before and
   * after, in seasons nothing else stores.
   */
  async function countsOf(kind: "football-data" | "taso", code: string) {
    const result = await getOutcomeShares();
    if (result.status !== "ok") throw new Error("the read failed");
    const row = result.rows.find((candidate) => candidate.kind === kind && candidate.code === code);
    const count = (share: number) => Math.round(((row?.matches ?? 0) * share) / 100);
    return {
      matches: row?.matches ?? 0,
      home: count(row?.homeShare ?? 0),
      draws: count(row?.drawShare ?? 0),
      away: count(row?.awayShare ?? 0),
      spanningYears: result.spanningYears,
    };
  }

  const kickoff = (year: number) => new Date(`${year}-02-01T15:00:00Z`);

  it("counts a shoot-out as a draw, a playoff as a match, and only completed seasons", async () => {
    const before = await countsOf("football-data", "DED");
    let id = 991001;
    const row = (overrides: Partial<typeof matches.$inferInsert>) =>
      footballDataRow({ providerMatchId: id++, competitionCode: "DED", ...overrides });

    await db.insert(matches).values([
      // 2030, played into 2031: a home win, an away win, and a playoff tie
      // settled on penalties — stored as 5–4, really 1–1 (S3).
      row({ seasonId: 2030, kickoffAt: kickoff(2031), homeGoals: 2, awayGoals: 0 }),
      row({ seasonId: 2030, kickoffAt: kickoff(2031), homeGoals: 0, awayGoals: 1 }),
      row({
        seasonId: 2030,
        kickoffAt: kickoff(2031),
        stage: "PLAYOFFS",
        homeGoals: 5,
        awayGoals: 4,
        penaltiesHome: 4,
        penaltiesAway: 3,
      }),
      // Awarded with a score, never played to a result: not finished (S3).
      row({
        seasonId: 2030,
        kickoffAt: kickoff(2031),
        status: "AWARDED",
        homeGoals: 3,
        awayGoals: 0,
      }),
      // Unplayed with no score, and a finished match missing one: neither counts.
      row({
        seasonId: 2030,
        kickoffAt: kickoff(2031),
        status: "POSTPONED",
        homeGoals: null,
        awayGoals: null,
      }),
      row({ seasonId: 2030, kickoffAt: kickoff(2031), homeGoals: 3, awayGoals: null }),
      // 2031 still has a match to play: none of it counts (S19).
      row({ seasonId: 2031, kickoffAt: kickoff(2032), homeGoals: 4, awayGoals: 0 }),
      row({
        seasonId: 2031,
        kickoffAt: kickoff(2032),
        status: "TIMED",
        homeGoals: null,
        awayGoals: null,
      }),
    ]);

    const after = await countsOf("football-data", "DED");
    expect({
      matches: after.matches - before.matches,
      home: after.home - before.home,
      draws: after.draws - before.draws,
      away: after.away - before.away,
    }).toEqual({ matches: 3, home: 1, draws: 1, away: 1 });
    // Played across two years, so named as `2030/31`.
    expect(after.spanningYears?.last).toBe(2030);
  });

  it("files a TASO season under its own competition, over its own pair only", async () => {
    const before = await countsOf("taso", "VL");
    let id = 991001;
    const row = (overrides: Partial<typeof tasoMatches.$inferInsert>) =>
      tasoRow({
        providerMatchId: id++,
        seasonId: 2030,
        competitionCode: "spljp30",
        categoryId: "VL",
        kickoffAt: kickoff(2030),
        ...overrides,
      });

    await db.insert(tasoMatches).values([
      row({ homeGoals: 1, awayGoals: 1 }),
      row({ homeGoals: 2, awayGoals: 1 }),
      // Being played: a score so far, not a result — and it holds 2031 open.
      row({
        seasonId: 2031,
        competitionCode: "spljp31",
        status: "Live",
        homeGoals: 1,
        awayGoals: 0,
      }),
      row({ seasonId: 2031, competitionCode: "spljp31", homeGoals: 3, awayGoals: 0 }),
      // The same category under another competition that season: not VL's.
      row({ competitionCode: "Liigacup30", homeGoals: 0, awayGoals: 5 }),
    ]);

    const after = await countsOf("taso", "VL");
    expect({
      matches: after.matches - before.matches,
      home: after.home - before.home,
      draws: after.draws - before.draws,
      away: after.away - before.away,
    }).toEqual({ matches: 2, home: 1, draws: 1, away: 0 });
  });
});

describe("a competition's home-win baseline (specs/051)", () => {
  /**
   * The read spans a competition's whole stored history, which other suites'
   * fixtures share, so each test measures what its own rows add — as the
   * specs/049 block above does — in seasons nothing else stores.
   */
  async function countsOf(kind: "football-data" | "taso", code: string) {
    const result = await getHomeBaseline(kind, code);
    if (result.status === "error") throw new Error("the read failed");
    if (result.status === "empty") return { matches: 0, home: 0, draws: 0, away: 0, seasons: null };
    const count = (share: number) => Math.round((result.matches * share) / 100);
    return {
      matches: result.matches,
      home: count(result.homeShare),
      draws: count(result.drawShare),
      away: count(result.awayShare),
      seasons: result.seasons,
    };
  }

  function added(
    before: Awaited<ReturnType<typeof countsOf>>,
    after: Awaited<ReturnType<typeof countsOf>>
  ) {
    return {
      matches: after.matches - before.matches,
      home: after.home - before.home,
      draws: after.draws - before.draws,
      away: after.away - before.away,
    };
  }

  const kickoff = (year: number) => new Date(`${year}-02-01T15:00:00Z`);

  it("counts every season, the one in progress included, and a shoot-out as a draw", async () => {
    const before = await countsOf("football-data", "DED");
    let id = 991001;
    const row = (overrides: Partial<typeof matches.$inferInsert>) =>
      footballDataRow({ providerMatchId: id++, competitionCode: "DED", ...overrides });

    await db.insert(matches).values([
      // Below the football-data plan floor: counted all the same (S2).
      row({ seasonId: 2010, kickoffAt: kickoff(2011), homeGoals: 0, awayGoals: 2 }),
      // A tie settled on penalties — stored as 5–4, really 1–1.
      row({
        seasonId: 2030,
        kickoffAt: kickoff(2031),
        homeGoals: 5,
        awayGoals: 4,
        penaltiesHome: 4,
        penaltiesAway: 3,
      }),
      // In progress: its finished match counts, its unplayed ones do not.
      row({ seasonId: 2031, kickoffAt: kickoff(2032), homeGoals: 3, awayGoals: 1 }),
      row({
        seasonId: 2031,
        kickoffAt: kickoff(2032),
        status: "TIMED",
        homeGoals: null,
        awayGoals: null,
      }),
      row({
        seasonId: 2031,
        kickoffAt: kickoff(2032),
        status: "IN_PLAY",
        homeGoals: 2,
        awayGoals: 0,
      }),
    ]);

    const after = await countsOf("football-data", "DED");
    expect(added(before, after)).toEqual({ matches: 3, home: 1, draws: 1, away: 1 });
    expect(after.seasons).toEqual({ first: 2010, last: 2031 });
  });

  it("files TASO rows by their season's pair, from before 2023 on", async () => {
    const before = await countsOf("taso", "VL");
    let id = 991001;
    const row = (seasonId: number, overrides: Partial<typeof tasoMatches.$inferInsert>) =>
      tasoRow({
        providerMatchId: id++,
        seasonId,
        competitionCode: `spljp${seasonId % 100}`,
        categoryId: "VL",
        kickoffAt: kickoff(seasonId),
        ...overrides,
      });

    await db.insert(tasoMatches).values([
      row(2016, { homeGoals: 2, awayGoals: 0 }),
      row(2031, { homeGoals: 1, awayGoals: 1 }),
      // Still to play, and being played: neither is a result.
      row(2031, { status: "SCHEDULED", homeGoals: null, awayGoals: null }),
      row(2031, { status: "Live", homeGoals: 0, awayGoals: 1 }),
      // The same category under another competition that season: not VL's.
      row(2031, { competitionCode: "Liigacup31", homeGoals: 0, awayGoals: 5 }),
    ]);

    const after = await countsOf("taso", "VL");
    expect(added(before, after)).toEqual({ matches: 2, home: 1, draws: 1, away: 0 });
    expect(after.seasons?.last).toBe(2031);
  });
});
