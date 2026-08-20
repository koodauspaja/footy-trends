import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { matches } from "@/db/schema";
import type { NormalizedProviderMatch } from "@/lib/football-data";
import { redis } from "@/lib/redis";
import { calculateStandings } from "@/lib/standings";

vi.mock("@/lib/football-data", () => ({
  getSeasonMatches: vi.fn(),
}));

const competitionCode = "PL";
const otherCompetitionCode = "BL1";
const seasonId = 990001;
/** Makes `seasonId` a completed past season rather than the one being played. */
const laterActiveSeasonId = seasonId + 1;
const cacheKey = `standings:${competitionCode}:${seasonId}`;

function buildMatch(overrides: Partial<NormalizedProviderMatch> = {}): NormalizedProviderMatch {
  return {
    providerMatchId: 900001,
    competitionCode,
    seasonId,
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

/** Narrows to matches with a final score, mirroring standings-service.ts's own filter. */
function toPlayedMatches<T extends { homeGoals: number | null; awayGoals: number | null }>(
  rows: T[]
): Array<T & { homeGoals: number; awayGoals: number }> {
  return rows.filter(
    (row): row is T & { homeGoals: number; awayGoals: number } =>
      row.homeGoals !== null && row.awayGoals !== null
  );
}

async function clearFixtures() {
  await db
    .delete(matches)
    .where(and(eq(matches.seasonId, seasonId), eq(matches.competitionCode, competitionCode)));
  await db
    .delete(matches)
    .where(and(eq(matches.seasonId, seasonId), eq(matches.competitionCode, otherCompetitionCode)));
  await redis.del(cacheKey);
  await redis.del(`standings:${otherCompetitionCode}:${seasonId}`);
}

describe("standings integration", () => {
  beforeEach(clearFixtures);

  afterEach(async () => {
    await clearFixtures();
    vi.clearAllMocks();
  });

  it("persists synchronized matches and calculates standings from the stored rows", async () => {
    const { synchronizeMatches } = await import("@/lib/standings-service");
    const providerMatches = [buildMatch()];

    await synchronizeMatches(providerMatches);
    const stored = await db
      .select()
      .from(matches)
      .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));

    expect(stored).toHaveLength(1);
    expect(calculateStandings(toPlayedMatches(stored))).toEqual(
      calculateStandings(toPlayedMatches(providerMatches))
    );
  });

  it("does not duplicate a match when the same provider response is synchronized twice", async () => {
    const { synchronizeMatches } = await import("@/lib/standings-service");
    const providerMatch = buildMatch({ homeGoals: 3, awayGoals: 0 });

    await synchronizeMatches([providerMatch]);
    await synchronizeMatches([{ ...providerMatch, homeGoals: 1, awayGoals: 1 }]);

    const stored = await db
      .select()
      .from(matches)
      .where(eq(matches.providerMatchId, providerMatch.providerMatchId));

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ homeGoals: 1, awayGoals: 1 });
  });

  it("falls back to stored standings when the provider refresh fails", async () => {
    const { getSeasonMatches } = await import("@/lib/football-data");
    vi.mocked(getSeasonMatches).mockRejectedValue(new Error("provider unavailable"));

    const { synchronizeMatches, getStandings } = await import("@/lib/standings-service");
    const providerMatch = buildMatch();
    await synchronizeMatches([providerMatch]);
    await db
      .update(matches)
      .set({ updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(matches.providerMatchId, providerMatch.providerMatchId));

    const result = await getStandings({ competitionCode, seasonId, activeSeasonId: seasonId });

    expect(result.status).toBe("ok");
    expect(result.standings.map((team) => team.teamName)).toContain("Integration United");
  });

  it("returns cached Redis standings without querying stored matches or the provider", async () => {
    const { getSeasonMatches } = await import("@/lib/football-data");
    const cachedStandings = calculateStandings(toPlayedMatches([buildMatch()]));
    await redis.setex(cacheKey, 60, JSON.stringify(cachedStandings));

    const { getStandings } = await import("@/lib/standings-service");
    const result = await getStandings({ competitionCode, seasonId, activeSeasonId: seasonId });

    expect(result).toEqual({ status: "ok", standings: cachedStandings });
    expect(getSeasonMatches).not.toHaveBeenCalled();
  });

  it("uses fresh stored matches without calling the provider", async () => {
    const { getSeasonMatches } = await import("@/lib/football-data");
    const { synchronizeMatches, getStandings } = await import("@/lib/standings-service");
    await synchronizeMatches([buildMatch()]);

    const result = await getStandings({ competitionCode, seasonId, activeSeasonId: seasonId });

    expect(result.status).toBe("ok");
    expect(result.standings.map((team) => team.teamName)).toContain("Integration United");
    expect(getSeasonMatches).not.toHaveBeenCalled();
  });

  it("backfills a season that has no stored matches", async () => {
    const { getSeasonMatches } = await import("@/lib/football-data");
    const providerMatches = [buildMatch()];
    vi.mocked(getSeasonMatches).mockResolvedValue(providerMatches);

    const { getStandings } = await import("@/lib/standings-service");
    const result = await getStandings({
      competitionCode,
      seasonId,
      activeSeasonId: laterActiveSeasonId,
    });

    const stored = await db
      .select()
      .from(matches)
      .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));

    expect(getSeasonMatches).toHaveBeenCalledWith(competitionCode, seasonId);
    expect(stored).toHaveLength(1);
    expect(result.status).toBe("ok");
    expect(result.standings.map((team) => team.teamName)).toContain("Integration United");
  });

  it("never refetches a past season that already has stored matches, however stale", async () => {
    const { getSeasonMatches } = await import("@/lib/football-data");
    const { synchronizeMatches, getStandings } = await import("@/lib/standings-service");
    const providerMatch = buildMatch();
    await synchronizeMatches([providerMatch]);
    await db
      .update(matches)
      .set({ updatedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) })
      .where(eq(matches.providerMatchId, providerMatch.providerMatchId));
    await redis.del(cacheKey);

    const result = await getStandings({
      competitionCode,
      seasonId,
      activeSeasonId: laterActiveSeasonId,
    });

    expect(getSeasonMatches).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  it("reports an empty season when the provider has no matches at all", async () => {
    const { getSeasonMatches } = await import("@/lib/football-data");
    vi.mocked(getSeasonMatches).mockResolvedValue([]);

    const { getStandings } = await import("@/lib/standings-service");
    const result = await getStandings({
      competitionCode,
      seasonId,
      activeSeasonId: laterActiveSeasonId,
    });

    expect(result).toEqual({ status: "empty", standings: [] });
  });

  it("stores a finished and an unplayed match side by side, and shows the unplayed team as a zero-stats row", async () => {
    const { synchronizeMatches, getStandings, getTeamMatches } = await import(
      "@/lib/standings-service"
    );
    const finished = buildMatch();
    const upcoming = buildMatch({
      providerMatchId: 900002,
      status: "SCHEDULED",
      homeGoals: null,
      awayGoals: null,
      homeTeamProviderId: 9003,
      homeTeamName: "Integration Rovers",
    });

    await synchronizeMatches([finished, upcoming]);

    const stored = await db
      .select()
      .from(matches)
      .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)))
      .orderBy(matches.providerMatchId);

    // Confirms the migration: a NULL-goals, non-default-status row round-trips through Postgres.
    expect(stored).toHaveLength(2);
    expect(stored[1]).toMatchObject({ status: "SCHEDULED", homeGoals: null, awayGoals: null });

    const standings = await getStandings({ competitionCode, seasonId, activeSeasonId: seasonId });
    expect(standings.status).toBe("ok");
    const rovers =
      standings.status === "ok" &&
      standings.standings.find((team) => team.teamName === "Integration Rovers");
    expect(rovers).toMatchObject({ played: 0, points: 0 });

    const teamMatches = await getTeamMatches(competitionCode, 9003, seasonId, seasonId);
    expect(teamMatches).toEqual({ status: "ok", matches: [expect.objectContaining(upcoming)] });
  });

  it("getRoundMatches filters stored rows to one round, sorted by kickoff time", async () => {
    const { synchronizeMatches, getRoundMatches } = await import("@/lib/standings-service");
    await synchronizeMatches([
      buildMatch({
        providerMatchId: 900001,
        matchday: 1,
        kickoffAt: new Date("2026-08-02T15:00:00Z"),
      }),
      buildMatch({
        providerMatchId: 900002,
        matchday: 1,
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
      }),
      buildMatch({
        providerMatchId: 900003,
        matchday: 2,
        kickoffAt: new Date("2026-08-09T15:00:00Z"),
      }),
    ]);

    const result = await getRoundMatches(competitionCode, seasonId, 1, seasonId);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.round).toBe(1);
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([
      900002, 900001,
    ]);
  });

  it("persists and retrieves an upcoming season's fixture list, all unplayed, showing every team at zero stats", async () => {
    const { getSeasonMatches } = await import("@/lib/football-data");
    const upcomingMatches = [
      buildMatch({
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        matchday: 1,
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
      }),
      buildMatch({
        providerMatchId: 900002,
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        matchday: 2,
        kickoffAt: new Date("2026-08-08T15:00:00Z"),
      }),
    ];
    vi.mocked(getSeasonMatches).mockResolvedValue(upcomingMatches);

    const { getRoundMatches, getStandings } = await import("@/lib/standings-service");
    // The season being requested is newer than the "active" one passed in,
    // mirroring how a not-yet-started season (widened into the selector by
    // spec 005) is still just an ordinary season sync from the data layer's
    // point of view — see specs/005-listing-matches-for-selected-season.md.
    const earlierActiveSeasonId = seasonId - 1;

    const result = await getRoundMatches(
      competitionCode,
      seasonId,
      undefined,
      earlierActiveSeasonId
    );
    const stored = await db
      .select()
      .from(matches)
      .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));

    expect(getSeasonMatches).toHaveBeenCalledWith(competitionCode, seasonId);
    expect(stored).toHaveLength(2);
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.round).toBe(1);

    const standings = await getStandings({
      competitionCode,
      seasonId,
      activeSeasonId: earlierActiveSeasonId,
    });
    expect(standings.status).toBe("ok");
    expect(
      standings.status === "ok" && standings.standings.every((team) => team.played === 0)
    ).toBe(true);
    expect(
      standings.status === "ok" && standings.standings.map((team) => team.teamName).sort()
    ).toEqual(["Integration City", "Integration United"]);
  });

  it("keeps two competitions' matches and standings for the same season fully separate", async () => {
    const { synchronizeMatches, getStandings, getTeamMatches } = await import(
      "@/lib/standings-service"
    );
    await synchronizeMatches([buildMatch()]);
    await synchronizeMatches([
      buildMatch({
        providerMatchId: 900099,
        competitionCode: otherCompetitionCode,
        homeTeamProviderId: 9101,
        homeTeamName: "Integration Athletic",
        awayTeamProviderId: 9102,
        awayTeamName: "Integration Wanderers",
      }),
    ]);

    const plStored = await db
      .select()
      .from(matches)
      .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));
    const bl1Stored = await db
      .select()
      .from(matches)
      .where(
        and(eq(matches.competitionCode, otherCompetitionCode), eq(matches.seasonId, seasonId))
      );
    expect(plStored).toHaveLength(1);
    expect(bl1Stored).toHaveLength(1);

    const plStandings = await getStandings({ competitionCode, seasonId, activeSeasonId: seasonId });
    const bl1Standings = await getStandings({
      competitionCode: otherCompetitionCode,
      seasonId,
      activeSeasonId: seasonId,
    });
    expect(plStandings.standings.map((team) => team.teamName)).toEqual([
      "Integration United",
      "Integration City",
    ]);
    expect(bl1Standings.standings.map((team) => team.teamName)).toEqual([
      "Integration Athletic",
      "Integration Wanderers",
    ]);

    const plTeamMatches = await getTeamMatches(otherCompetitionCode, 9001, seasonId, seasonId);
    expect(plTeamMatches).toEqual({ status: "not_found" });
  });
});
