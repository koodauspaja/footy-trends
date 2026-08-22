import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { tasoMatches } from "@/db/schema";
import { calculateStandings } from "@/lib/standings";
import type { NormalizedTasoMatch } from "@/lib/taso";

vi.mock("@/lib/taso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso")>();
  return { ...actual, getSeasonMatches: vi.fn(), getSeasonGroups: vi.fn() };
});

const competitionId = "spljp990001";
const seasonId = 990001;
/** Makes `seasonId` a completed past season rather than the one being played. */
const laterActiveSeasonId = seasonId + 1;

/** Narrows to matches with a final score, mirroring standings-service.ts's own filter. */
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
    providerMatchId: 900001,
    competitionCode: competitionId,
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
    ...overrides,
  };
}

async function clearFixtures() {
  await db
    .delete(tasoMatches)
    .where(and(eq(tasoMatches.seasonId, seasonId), eq(tasoMatches.competitionCode, competitionId)));
}

describe("taso integration", () => {
  beforeEach(clearFixtures);

  afterEach(async () => {
    await clearFixtures();
    vi.clearAllMocks();
  });

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

  it("own-calculates the origin group from stored matches, round-filtered", async () => {
    const { synchronizeMatches, getSeasonStandings } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({ providerMatchId: 900001, matchday: 1 }),
      buildMatch({
        providerMatchId: 900002,
        matchday: 2,
        homeTeamProviderId: 9002,
        awayTeamProviderId: 9001,
        homeGoals: 0,
        awayGoals: 0,
      }),
    ]);

    const full = await getSeasonStandings(competitionId, seasonId, seasonId, undefined);
    const roundOne = await getSeasonStandings(competitionId, seasonId, seasonId, 1);

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
      providerMatchId: 900002,
      status: "SCHEDULED",
      homeGoals: null,
      awayGoals: null,
      matchday: 2,
      homeTeamProviderId: 9003,
      homeTeamName: "Integration Rovers",
    });

    await synchronizeMatches([finished, upcoming]);

    const standings = await getSeasonStandings(competitionId, seasonId, seasonId, undefined);
    expect(standings.status).toBe("ok");
    const rovers =
      standings.status === "ok" &&
      standings.groups[0]?.kind === "own-calculated" &&
      standings.groups[0].standings.find((team) => team.teamName === "Integration Rovers");
    expect(rovers).toMatchObject({ played: 0, points: 0 });

    const teamMatches = await getTeamMatches(competitionId, 9003, seasonId, seasonId);
    expect(teamMatches).toEqual({ status: "ok", matches: [expect.objectContaining(upcoming)] });
  });

  it("lists a team's matches chronologically across groups it appeared in", async () => {
    const { synchronizeMatches, getTeamMatches } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({
        providerMatchId: 900002,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
      buildMatch({
        providerMatchId: 900001,
        groupId: 1,
        groupName: "Runkosarja",
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
      }),
    ]);

    const result = await getTeamMatches(competitionId, 9001, seasonId, seasonId);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([
      900001, 900002,
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
        providerMatchId: 900002,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
      buildMatch({ providerMatchId: 900001, kickoffAt: new Date("2026-08-01T15:00:00Z") }),
    ]);

    const result = await getSeasonMatchList(competitionId, seasonId, seasonId);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([
      900001, 900002,
    ]);
  });

  it("backfills a season with no stored matches from the provider", async () => {
    const { getSeasonMatches } = await import("@/lib/taso");
    const providerMatches = [buildMatch()];
    vi.mocked(getSeasonMatches).mockResolvedValue(providerMatches);

    const { getSeasonStandings } = await import("@/lib/taso-standings-service");
    const result = await getSeasonStandings(
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

    expect(getSeasonMatches).toHaveBeenCalledWith(competitionId);
    expect(stored).toHaveLength(1);
    expect(result.status).toBe("ok");
  });

  it("never refetches a past season that already has stored matches, however stale", async () => {
    const { getSeasonMatches } = await import("@/lib/taso");
    const { synchronizeMatches, getSeasonStandings } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([buildMatch()]);

    const result = await getSeasonStandings(
      competitionId,
      seasonId,
      laterActiveSeasonId,
      undefined
    );

    expect(getSeasonMatches).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });
});

/**
 * Carry-over config validation lives in
 * `tests/unit/lib/taso-carry-over.test.ts`, not here.
 *
 * A synthetic version of it used to sit in this file, building matches whose
 * win/draw/loss counts were engineered to total KuPS's real 67 points from
 * 32 games. That proved `calculateStandings` can add up — which its own
 * tests already cover — while proving nothing about `CARRY_OVER_CONFIG`,
 * the thing that actually fails silently when wrong. Removing an entry left
 * it green.
 *
 * The replacement drives the real `getSeasonStandings` over captured TASO
 * matches and asserts each split group against TASO's own published
 * standings, for every configured season. See #127.
 */
