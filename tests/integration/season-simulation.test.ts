import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { matches, tasoGroupTeams, tasoMatches } from "@/db/schema";

// No Redis in the integration job: every read reaches Postgres.
vi.mock("@/lib/cache", () => ({
  getCached: vi.fn(async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
    fetcher()
  ),
  getCachedUnlessDegraded: vi.fn(
    async (_key: string, _ttl: number, fetcher: () => Promise<{ value: unknown }>) =>
      (await fetcher()).value
  ),
}));

import { getSeasonForecast } from "@/lib/season-simulation-service";

/**
 * The season forecast's reads against a real Postgres, for both providers: the
 * table and the fixtures of a season in progress, and the fit of the stored
 * matches. The season is 2090, which no provider is asked about because its
 * rows are fresh; its played matches are dated this month so that the fit
 * holds them.
 *
 * decisions/061-season-simulation.md
 */

const SEASON = 2090;
const IDS = Array.from({ length: 16 }, (_, index) => 961_001 + index);
const TEAM = (number: number) => 961_100 + number;
const DAY_MS = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

async function clear() {
  await db.delete(matches).where(inArray(matches.providerMatchId, IDS));
  await db.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, IDS));
  await db
    .delete(tasoGroupTeams)
    .where(and(eq(tasoGroupTeams.categoryId, "VL"), eq(tasoGroupTeams.seasonId, SEASON)));
}

beforeEach(clear);
afterEach(clear);

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe("a foreign league's season in progress", () => {
  function row(
    index: number,
    home: number,
    away: number,
    score: [number, number] | null,
    overrides: Partial<typeof matches.$inferInsert> = {}
  ): typeof matches.$inferInsert {
    return {
      providerMatchId: IDS[index] as number,
      competitionCode: "PL",
      seasonId: SEASON,
      kickoffAt: score === null ? daysFromNow(7 + index) : daysFromNow(-10 + index),
      matchday: index + 1,
      status: score === null ? "TIMED" : "FINISHED",
      stage: "REGULAR_SEASON",
      groupName: null,
      homeTeamProviderId: TEAM(home),
      homeTeamName: `Forecast ${home}`,
      awayTeamProviderId: TEAM(away),
      awayTeamName: `Forecast ${away}`,
      homeGoals: score?.[0] ?? null,
      awayGoals: score?.[1] ?? null,
      ...overrides,
    };
  }

  it("simulates the regular season's fixtures from its table, leaving out play-offs and a cancelled match", async () => {
    await db
      .insert(matches)
      .values([
        row(0, 1, 2, [2, 0]),
        row(1, 3, 2, [1, 1]),
        row(2, 3, 1, null),
        row(3, 2, 1, null, { status: "POSTPONED" }),
        row(4, 2, 3, null, { status: "CANCELLED" }),
        row(5, 3, 1, [5, 0], { stage: "PLAYOFFS" }),
        row(6, 1, 2, null, { stage: "FINAL" }),
      ]);

    const forecast = await getSeasonForecast("football-data", "PL", SEASON, SEASON);

    expect(forecast).toMatchObject({
      status: "ok",
      layout: "single",
      tables: [{ groupName: null, decidesTitle: true }],
    });
    const rows = forecast.status === "ok" ? (forecast.tables[0]?.rows ?? []) : [];
    // Team 1 won; teams 3 and 2 drew, and team 2 lost by two.
    expect(rows.map((team) => team.teamProviderId)).toEqual([TEAM(1), TEAM(3), TEAM(2)]);
    const [first, second, third] = rows.map((team) => team.expectedPoints);
    // Two fixtures for team 1, one each for the others: no play-off, no cancelled match.
    expect(first).toBeGreaterThan(3);
    expect(first).toBeLessThan(9);
    expect(second).toBeGreaterThan(1);
    expect(second).toBeLessThan(4);
    expect(third).toBeGreaterThan(1);
    expect(third).toBeLessThan(4);
    // Five points in the table, and two to three more from each of two fixtures.
    const added = sum(rows.map((team) => team.expectedPoints)) - 5;
    expect(added).toBeGreaterThan(4);
    expect(added).toBeLessThan(6);
    expect(sum(rows.map((team) => team.first.share))).toBeCloseTo(1, 10);
  });
});

describe("a domestic league's season in progress", () => {
  function row(
    index: number,
    groupId: number,
    home: number,
    away: number,
    score: [number, number] | null,
    status = score === null ? "SCHEDULED" : "FINISHED"
  ): typeof tasoMatches.$inferInsert {
    return {
      providerMatchId: IDS[index] as number,
      competitionCode: "spljp90",
      categoryId: "VL",
      seasonId: SEASON,
      groupId,
      groupName: groupId === 1 ? "Lohko A" : "Lohko B",
      kickoffAt: score === null ? daysFromNow(7 + index) : daysFromNow(-10 + index),
      matchday: index + 1,
      status,
      winner: null,
      homeTeamProviderId: TEAM(home),
      homeTeamName: `Forecast ${home}`,
      awayTeamProviderId: TEAM(away),
      awayTeamName: `Forecast ${away}`,
      homeGoals: score?.[0] ?? null,
      awayGoals: score?.[1] ?? null,
    };
  }

  function published(groupId: number, team: number, points: number) {
    return {
      categoryId: "VL",
      competitionCode: "spljp90",
      seasonId: SEASON,
      groupId,
      teamProviderId: TEAM(team),
      teamName: `Forecast ${team}`,
      startingPoints: 0,
      points,
    };
  }

  const season = [
    row(0, 1, 1, 2, [3, 0]),
    row(1, 1, 2, 1, null),
    row(2, 1, 1, 2, null, "Abandoned"),
    row(3, 2, 3, 4, [1, 1]),
  ];

  it("simulates each table of ours, one with a fixture left and one without", async () => {
    await db.insert(tasoMatches).values(season);
    await db
      .insert(tasoGroupTeams)
      .values([published(1, 1, 3), published(1, 2, 0), published(2, 3, 1), published(2, 4, 1)]);

    const forecast = await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(forecast).toMatchObject({
      status: "ok",
      layout: "several",
      tables: [
        { groupName: "Lohko A", decidesTitle: false },
        { groupName: "Lohko B", decidesTitle: false },
      ],
    });
    const [poolA, poolB] = forecast.status === "ok" ? forecast.tables : [];
    expect(poolA?.rows.map((team) => team.teamProviderId)).toEqual([TEAM(1), TEAM(2)]);
    // One fixture between them, and not the abandoned match: two to three points added.
    const added = sum(poolA?.rows.map((team) => team.expectedPoints) ?? []) - 3;
    expect(added).toBeGreaterThan(2);
    expect(added).toBeLessThan(3);
    // Team 2 can reach three points at most, level with team 1, which stays first.
    expect(poolA?.rows.map((team) => team.first)).toEqual([
      { share: 1, settled: true },
      { share: 0, settled: true },
    ]);
    expect(poolB?.rows.map((team) => [team.expectedPoints, team.first])).toEqual([
      [1, { share: 1, settled: true }],
      [1, { share: 0, settled: true }],
    ]);
  });

  it("leaves out a table TASO's own numbers disagree with", async () => {
    await db.insert(tasoMatches).values(season);
    // TASO says team 3 has seven points; its one stored match gives it one.
    await db
      .insert(tasoGroupTeams)
      .values([published(1, 1, 3), published(1, 2, 0), published(2, 3, 7), published(2, 4, 1)]);

    const forecast = await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(forecast.status === "ok" && forecast.tables.map((table) => table.groupName)).toEqual([
      "Lohko A",
    ]);
    expect(forecast).toMatchObject({ layout: "several" });
  });
});
