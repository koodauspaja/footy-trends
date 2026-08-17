import { and, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getSeasonMatches, type NormalizedProviderMatch } from "./football-data";
import { logger } from "./logger";
import { redis } from "./redis";
import { resolveCurrentRound } from "./rounds";
import { calculateStandings, type NormalizedMatch, type TeamStanding } from "./standings";

const FINISHED_STATUS = "FINISHED";
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
  /** Which competition to show standings for. */
  competitionCode: string;
  /** The season to show. Must already be validated against the selectable seasons. */
  seasonId: number;
  /** The newest started season, used to decide whether `seasonId` is still being played. */
  activeSeasonId: number;
  /**
   * Restricts standings to matches with `matchday <= round`. Bypasses the
   * season-level cache, which only stores the full-season result — see
   * specs/003-standings-after-selected-round.md.
   */
  round?: number;
};

export type TeamMatchesResult =
  | { status: "ok"; matches: NormalizedProviderMatch[] }
  | { status: "not_found" }
  | { status: "empty" }
  | { status: "error" };

export type RoundMatchesResult =
  | { status: "ok"; round: number; matches: NormalizedProviderMatch[] }
  | { status: "empty" }
  | { status: "error" };

type StoredMatch = typeof matches.$inferSelect;
/** A match from either the DB or a fresh provider fetch — see football-data.ts. */
type MatchRow = NormalizedProviderMatch;

/** Matches with no known matchday are excluded once a round filter applies. */
function filterByRound<T extends { matchday: number | null }>(
  matchList: T[],
  round: number | undefined
): T[] {
  if (round === undefined) return matchList;
  return matchList.filter((match) => match.matchday !== null && match.matchday <= round);
}

/**
 * Narrows to matches with a final score, which is what `calculateStandings`
 * requires. A match with `status !== "FINISHED"` is excluded even if it
 * happens to carry goals (defensive — the provider should never do this).
 */
function toFinishedMatches(matchList: MatchRow[]): NormalizedMatch[] {
  return matchList.filter(
    (match): match is MatchRow & { homeGoals: number; awayGoals: number } =>
      match.status === FINISHED_STATUS && match.homeGoals !== null && match.awayGoals !== null
  );
}

type SyncedSeasonMatches = { matches: MatchRow[]; refreshFailed: boolean };

/**
 * Reads a season's stored matches and refreshes them from the provider when
 * stale, per `needsRefresh`. Shared by `getStandings` and
 * `getTeamMatches` so both see the same season data through one sync path —
 * see specs/004-listing-matches-for-selected-team.md.
 *
 * Never throws: a failed refresh falls back to whatever is already stored,
 * with `refreshFailed: true` so callers can distinguish "stale but present"
 * from "genuinely nothing to show" when deciding between an empty and an
 * error result.
 */
async function getSyncedSeasonMatches(
  competitionCode: string,
  seasonId: number,
  activeSeasonId: number
): Promise<SyncedSeasonMatches> {
  const storedMatches = await db
    .select()
    .from(matches)
    .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)))
    .orderBy(desc(matches.updatedAt));

  if (!needsRefresh(seasonId, activeSeasonId, storedMatches)) {
    return { matches: storedMatches, refreshFailed: false };
  }

  try {
    const providerMatches = await getSeasonMatches(competitionCode, seasonId);
    await synchronizeMatches(providerMatches);
    return { matches: providerMatches, refreshFailed: false };
  } catch (error) {
    logger.warn(
      { err: error, competitionCode, seasonId },
      "Competition refresh failed; using stored matches"
    );
    return { matches: storedMatches, refreshFailed: true };
  }
}

export async function getStandings({
  competitionCode,
  seasonId,
  activeSeasonId,
  round,
}: StandingsRequest): Promise<StandingsResult> {
  try {
    const cacheKey = `standings:${competitionCode}:${seasonId}`;
    if (round === undefined) {
      const cached = await readCachedStandings(cacheKey);
      if (cached) return toResult(cached);
    }

    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );
    const standings = calculateStandings(filterByRound(toFinishedMatches(seasonMatches), round));

    if (standings.length === 0) {
      return refreshFailed
        ? { status: "error", standings: [] }
        : { status: "empty", standings: [] };
    }
    // Never cache a stale fallback: if the refresh failed, this is admittedly
    // out-of-date data serving only because nothing better was available.
    if (round === undefined && !refreshFailed) await writeCachedStandings(cacheKey, standings);
    return { status: "ok", standings };
  } catch (error) {
    logger.error({ err: error, competitionCode, seasonId }, "Unable to load standings");
    return { status: "error", standings: [] };
  }
}

/**
 * A team's full match list for a season — played and upcoming — sorted by
 * kickoff time. A team is only known to exist here through its matches;
 * there is no independent teams table, so a team id that appears in no
 * stored match for the season is indistinguishable from an unknown id (both
 * report `"not_found"`).
 *
 * Wrapped in React's `cache()` so the team page's `generateMetadata` (which
 * needs the team's first match to name the page) and its default export
 * share one call per request instead of hitting the database twice.
 */
export const getTeamMatches = cache(async function getTeamMatches(
  competitionCode: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<TeamMatchesResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );

    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error" } : { status: "empty" };
    }

    const teamMatches = seasonMatches
      .filter(
        (match) =>
          match.homeTeamProviderId === teamProviderId || match.awayTeamProviderId === teamProviderId
      )
      .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime());

    if (teamMatches.length === 0) return { status: "not_found" };
    return { status: "ok", matches: teamMatches };
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to load team matches"
    );
    return { status: "error" };
  }
});

/**
 * Every match for one round (matchday) of a season, all teams — shares the
 * same sync path as `getStandings` and `getTeamMatches`. When
 * `round` is `undefined`, resolves and returns the season's current round
 * instead of requiring the caller to already know it.
 */
export async function getRoundMatches(
  competitionCode: string,
  seasonId: number,
  round: number | undefined,
  activeSeasonId: number
): Promise<RoundMatchesResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );

    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error" } : { status: "empty" };
    }

    const matchdays = seasonMatches.flatMap((match) =>
      match.matchday !== null ? [match.matchday] : []
    );
    if (matchdays.length === 0) return { status: "empty" };
    const maxMatchday = Math.max(...matchdays);

    const resolvedRound = round ?? resolveCurrentRound(seasonMatches, maxMatchday);
    const roundMatches = seasonMatches
      .filter((match) => match.matchday === resolvedRound)
      .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime());

    return { status: "ok", round: resolvedRound, matches: roundMatches };
  } catch (error) {
    logger.error({ err: error, competitionCode, seasonId, round }, "Unable to load round matches");
    return { status: "error" };
  }
}

/** The highest matchday with at least one stored match for the season, or null if none. */
export async function getMaxMatchday(
  competitionCode: string,
  seasonId: number
): Promise<number | null> {
  const [row] = await db
    .select({ maxMatchday: sql<number | null>`max(${matches.matchday})` })
    .from(matches)
    .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));
  return row?.maxMatchday ?? null;
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

export async function synchronizeMatches(
  providerMatches: NormalizedProviderMatch[]
): Promise<void> {
  if (providerMatches.length === 0) return;

  await db
    .insert(matches)
    .values(providerMatches.map((match) => ({ ...match, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: matches.providerMatchId,
      set: {
        competitionCode: sql`excluded.competition_code`,
        seasonId: sql`excluded.season_id`,
        status: sql`excluded.status`,
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
