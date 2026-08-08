import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getCurrentSeasonId, getFinishedMatches } from "./football-data";
import { logger } from "./logger";
import { redis } from "./redis";
import { calculateStandings, type NormalizedMatch, type TeamStanding } from "./standings";

const COMPETITION_CODE = "PL";
const STANDINGS_CACHE_TTL_SECONDS = 15 * 60;
const refreshIntervalSeconds = Number(process.env.FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS ?? "3600");

export type StandingsResult =
  | { status: "ok"; standings: TeamStanding[] }
  | { status: "empty"; standings: [] }
  | { status: "error"; standings: [] };

export async function getPremierLeagueStandings(): Promise<StandingsResult> {
  try {
    const seasonId = await getCurrentSeasonId();
    const cacheKey = `standings:${COMPETITION_CODE}:${seasonId}`;
    const cached = await readCachedStandings(cacheKey);
    if (cached) return { status: "ok", standings: cached };

    const storedMatches = await db
      .select()
      .from(matches)
      .where(and(eq(matches.competitionCode, COMPETITION_CODE), eq(matches.seasonId, seasonId)))
      .orderBy(desc(matches.updatedAt));
    const storedStandings = calculateStandings(storedMatches);
    const newestUpdate = storedMatches[0]?.updatedAt;
    const isFresh =
      newestUpdate !== undefined &&
      Date.now() - newestUpdate.getTime() < refreshIntervalSeconds * 1000;

    if (!isFresh) {
      try {
        const providerMatches = await getFinishedMatches(seasonId);
        await synchronizeMatches(providerMatches);
        const refreshedStandings = calculateStandings(providerMatches);
        await writeCachedStandings(cacheKey, refreshedStandings);
        return refreshedStandings.length > 0
          ? { status: "ok", standings: refreshedStandings }
          : { status: "empty", standings: [] };
      } catch (error) {
        logger.warn({ err: error }, "Premier League refresh failed; using stored matches");
        if (storedStandings.length > 0) return { status: "ok", standings: storedStandings };
        return { status: "error", standings: [] };
      }
    }

    if (storedStandings.length === 0) return { status: "empty", standings: [] };
    await writeCachedStandings(cacheKey, storedStandings);
    return { status: "ok", standings: storedStandings };
  } catch (error) {
    logger.error({ err: error }, "Unable to load Premier League standings");
    return { status: "error", standings: [] };
  }
}

export async function synchronizeMatches(providerMatches: NormalizedMatch[]): Promise<void> {
  if (providerMatches.length === 0) return;

  await db
    .insert(matches)
    .values(providerMatches.map((match) => ({ ...match, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: matches.providerMatchId,
      set: {
        competitionCode: sql`excluded.competition_code`,
        seasonId: sql`excluded.season_id`,
        kickoffAt: sql`excluded.kickoff_at`,
        matchday: sql`excluded.matchday`,
        homeTeamProviderId: sql`excluded.home_team_provider_id`,
        homeTeamName: sql`excluded.home_team_name`,
        awayTeamProviderId: sql`excluded.away_team_provider_id`,
        awayTeamName: sql`excluded.away_team_name`,
        homeGoals: sql`excluded.home_goals`,
        awayGoals: sql`excluded.away_goals`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

async function readCachedStandings(key: string): Promise<TeamStanding[] | null> {
  try {
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as TeamStanding[]) : null;
  } catch (error) {
    logger.warn({ err: error }, "Standings cache read failed");
    return null;
  }
}

async function writeCachedStandings(key: string, value: TeamStanding[]): Promise<void> {
  try {
    await redis.setex(key, STANDINGS_CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch (error) {
    logger.warn({ err: error }, "Standings cache write failed");
  }
}
