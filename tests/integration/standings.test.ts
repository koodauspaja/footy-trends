import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { matches } from "@/db/schema";
import type { NormalizedProviderMatch } from "@/lib/football-data";
import { redis } from "@/lib/redis";
import { calculateStandings } from "@/lib/standings";

vi.mock("@/lib/football-data", () => ({
  getFinishedMatches: vi.fn(),
}));

const competitionCode = "PL";
const seasonId = 990001;
/** Makes `seasonId` a completed past season rather than the one being played. */
const laterActiveSeasonId = seasonId + 1;
const cacheKey = `standings:${competitionCode}:${seasonId}`;

function buildMatch(overrides: Partial<NormalizedProviderMatch> = {}): NormalizedProviderMatch {
  return {
    providerMatchId: 900001,
    competitionCode,
    seasonId,
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
    .delete(matches)
    .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));
  await redis.del(cacheKey);
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
    expect(calculateStandings(stored)).toEqual(calculateStandings(providerMatches));
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
    const { getFinishedMatches } = await import("@/lib/football-data");
    vi.mocked(getFinishedMatches).mockRejectedValue(new Error("provider unavailable"));

    const { synchronizeMatches, getPremierLeagueStandings } = await import(
      "@/lib/standings-service"
    );
    const providerMatch = buildMatch();
    await synchronizeMatches([providerMatch]);
    await db
      .update(matches)
      .set({ updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(matches.providerMatchId, providerMatch.providerMatchId));

    const result = await getPremierLeagueStandings({ seasonId, activeSeasonId: seasonId });

    expect(result.status).toBe("ok");
    expect(result.standings.map((team) => team.teamName)).toContain("Integration United");
  });

  it("returns cached Redis standings without querying stored matches or the provider", async () => {
    const { getFinishedMatches } = await import("@/lib/football-data");
    const cachedStandings = calculateStandings([buildMatch()]);
    await redis.setex(cacheKey, 60, JSON.stringify(cachedStandings));

    const { getPremierLeagueStandings } = await import("@/lib/standings-service");
    const result = await getPremierLeagueStandings({ seasonId, activeSeasonId: seasonId });

    expect(result).toEqual({ status: "ok", standings: cachedStandings });
    expect(getFinishedMatches).not.toHaveBeenCalled();
  });

  it("uses fresh stored matches without calling the provider", async () => {
    const { getFinishedMatches } = await import("@/lib/football-data");
    const { synchronizeMatches, getPremierLeagueStandings } = await import(
      "@/lib/standings-service"
    );
    await synchronizeMatches([buildMatch()]);

    const result = await getPremierLeagueStandings({ seasonId, activeSeasonId: seasonId });

    expect(result.status).toBe("ok");
    expect(result.standings.map((team) => team.teamName)).toContain("Integration United");
    expect(getFinishedMatches).not.toHaveBeenCalled();
  });

  it("backfills a season that has no stored matches", async () => {
    const { getFinishedMatches } = await import("@/lib/football-data");
    const providerMatches = [buildMatch()];
    vi.mocked(getFinishedMatches).mockResolvedValue(providerMatches);

    const { getPremierLeagueStandings } = await import("@/lib/standings-service");
    const result = await getPremierLeagueStandings({
      seasonId,
      activeSeasonId: laterActiveSeasonId,
    });

    const stored = await db
      .select()
      .from(matches)
      .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));

    expect(getFinishedMatches).toHaveBeenCalledWith(seasonId);
    expect(stored).toHaveLength(1);
    expect(result.status).toBe("ok");
    expect(result.standings.map((team) => team.teamName)).toContain("Integration United");
  });

  it("never refetches a past season that already has stored matches, however stale", async () => {
    const { getFinishedMatches } = await import("@/lib/football-data");
    const { synchronizeMatches, getPremierLeagueStandings } = await import(
      "@/lib/standings-service"
    );
    const providerMatch = buildMatch();
    await synchronizeMatches([providerMatch]);
    await db
      .update(matches)
      .set({ updatedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) })
      .where(eq(matches.providerMatchId, providerMatch.providerMatchId));
    await redis.del(cacheKey);

    const result = await getPremierLeagueStandings({
      seasonId,
      activeSeasonId: laterActiveSeasonId,
    });

    expect(getFinishedMatches).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });

  it("reports an empty season when the provider has no finished matches", async () => {
    const { getFinishedMatches } = await import("@/lib/football-data");
    vi.mocked(getFinishedMatches).mockResolvedValue([]);

    const { getPremierLeagueStandings } = await import("@/lib/standings-service");
    const result = await getPremierLeagueStandings({
      seasonId,
      activeSeasonId: laterActiveSeasonId,
    });

    expect(result).toEqual({ status: "empty", standings: [] });
  });
});
