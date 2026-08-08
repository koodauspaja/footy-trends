import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getFinishedMatches } from "./football-data";
import { logger } from "./logger";
import { redis } from "./redis";
import { calculateStandings, type NormalizedMatch, type TeamStanding } from "./standings";

const COMPETITION_CODE = "PL";
const STANDINGS_CACHE_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_INTERVAL_SECONDS = 3600;
const parsedRefreshIntervalSeconds = Number(process.env.FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS);
const refreshIntervalSeconds =
  Number.isFinite(parsedRefreshIntervalSeconds) && parsedRefreshIntervalSeconds > 0
    ? parsedRefreshIntervalSeconds
    : DEFAULT_REFRESH_INTERVAL_SECONDS;

export type StandingsResult =
  | { status: "ok"; standings: TeamStanding[] }
  | { status: "empty"; standings: [] }
  | { status: "error"; standings: [] };

export type StandingsRequest = {
  /** The season to show. Must already be validated against the selectable seasons. */
  seasonId: number;
  /** The newest started season, used to decide whether `seasonId` is still being played. */
  activeSeasonId: number;
};

type StoredMatch = typeof matches.$inferSelect;

export async function getPremierLeagueStandings({
  seasonId,
  activeSeasonId,
}: StandingsRequest): Promise<StandingsResult> {
  try {
    const cacheKey = `standings:${COMPETITION_CODE}:${seasonId}`;
    const cached = await readCachedStandings(cacheKey);
    if (cached) return toResult(cached);

    const storedMatches = await db
      .select()
      .from(matches)
      .where(and(eq(matches.competitionCode, COMPETITION_CODE), eq(matches.seasonId, seasonId)))
      .orderBy(desc(matches.updatedAt));
    const storedStandings = calculateStandings(storedMatches);

    if (needsRefresh(seasonId, activeSeasonId, storedMatches)) {
      try {
        const providerMatches = await getFinishedMatches(seasonId);
        await synchronizeMatches(providerMatches);
        const refreshedStandings = calculateStandings(providerMatches);
        await writeCachedStandings(cacheKey, refreshedStandings);
        return toResult(refreshedStandings);
      } catch (error) {
        logger.warn(
          { err: error, seasonId },
          "Premier League refresh failed; using stored matches"
        );
        if (storedStandings.length > 0) return { status: "ok", standings: storedStandings };
        return { status: "error", standings: [] };
      }
    }

    if (storedStandings.length === 0) return { status: "empty", standings: [] };
    await writeCachedStandings(cacheKey, storedStandings);
    return { status: "ok", standings: storedStandings };
  } catch (error) {
    logger.error({ err: error, seasonId }, "Unable to load Premier League standings");
    return { status: "error", standings: [] };
  }
}

/**
 * A completed season's results never change, so it is fetched at most once and
 * the freshness threshold does not apply to it. Only the season currently being
 * played is re-checked against the provider.
 *
 * `storedMatches` must be ordered newest `updatedAt` first.
 */
export function needsRefresh(
  seasonId: number,
  activeSeasonId: number,
  storedMatches: Array<Pick<StoredMatch, "updatedAt">>
): boolean {
  const newestUpdate = storedMatches[0]?.updatedAt;
  if (newestUpdate === undefined) return true;
  if (seasonId < activeSeasonId) return false;

  return Date.now() - newestUpdate.getTime() >= refreshIntervalSeconds * 1000;
}

function toResult(standings: TeamStanding[]): StandingsResult {
  return standings.length > 0 ? { status: "ok", standings } : { status: "empty", standings: [] };
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
