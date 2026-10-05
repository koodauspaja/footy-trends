import { and, desc, eq, lt, sql } from "drizzle-orm";
import { cache } from "react";
import { db, type Executor } from "@/db";
import { matches } from "@/db/schema";
import { getCompetitionFormat, getCompetitionName, regionOfCompetition } from "./competitions";
import { getSeasonMatches, type NormalizedProviderMatch } from "./football-data";
import { logger } from "./logger";
import { type PositionSeries, singleTableSeries } from "./position-series";
import { redis } from "./redis";
import { resolveCurrentRound } from "./rounds";
import {
  comparisonFor,
  RANKED_MEASURES,
  type SeasonComparisonSeries,
  type SeasonReadResult,
  UNRANKED_MEASURES,
} from "./season-comparison";
import {
  calculateStandings,
  selectTeamMatches,
  type TeamStanding,
  toFinishedMatches,
} from "./standings";
import { competitionScope, recordsFor, type StreakRecordsSeries } from "./streak-records";
import { type SeasonMovement, singleTableMovement } from "./table-volatility";
import type { TeamPanelMatches } from "./team-panels";
import type { TeamSeason } from "./team-seasons";

const STANDINGS_CACHE_TTL_SECONDS = 15 * 60;

/**
 * The Redis key a competition-season's computed table caches under, exported
 * so a forced refresh clears it too.
 *
 * decisions/029-forced-season-refresh.md
 */
export function standingsCacheKey(competitionCode: string, seasonId: number): string {
  return `standings:${competitionCode}:${seasonId}`;
}
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

type SyncedSeasonMatches = { matches: MatchRow[]; refreshFailed: boolean };

/**
 * A season's stored matches, refreshed from the provider when `needsRefresh`
 * says so. Never throws: a failed refresh serves what is stored, flagged.
 * `cache()`d, so every reader of a season in one request shares a read.
 *
 * decisions/004-listing-matches-for-selected-team.md
 * decisions/030-league-position-by-matchday.md
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
const getSyncedSeasonMatches = cache(async function getSyncedSeasonMatches(
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
});

export async function getStandings({
  competitionCode,
  seasonId,
  activeSeasonId,
  round,
}: StandingsRequest): Promise<StandingsResult> {
  try {
    const cacheKey = standingsCacheKey(competitionCode, seasonId);
    if (round === undefined) {
      const cached = await readCachedStandings(cacheKey);
      if (cached) return toResult(cached);
    }

    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );
    const standings = calculateStandings(
      filterByRound(toFinishedMatches(seasonMatches), round),
      seasonMatches
    );

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
 * This team's league position after each round, from the same cached season
 * read; each table is the standings page's for that round.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/531-comments-say-what-code-is-for.md
 */
export async function getTeamPositionSeries(
  competitionCode: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<PositionSeries> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );

    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error" } : { status: "no-rounds" };
    }

    return singleTableSeries(toFinishedMatches(seasonMatches), seasonMatches, teamProviderId);
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to compute the league position series"
    );
    return { status: "error" };
  }
}

/**
 * The season's finished matches for the team's result panels, from the same
 * cached read. Nothing stored is empty, unless the refresh failed: an error.
 *
 * decisions/031-rolling-form-trend.md
 * decisions/531-comments-say-what-code-is-for.md
 */
export async function getTeamPanelMatches(
  competitionCode: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<TeamPanelMatches> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0 && refreshFailed) return { status: "error" };

    return { status: "ok", finished: toFinishedMatches(seasonMatches) };
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to read the matches a team's panels count"
    );
    return { status: "error" };
  }
}

/**
 * The selected season against the club's others, as `seasonsBeside` picks them;
 * a cup is measured without the ranked measures, having no table.
 *
 * decisions/038-season-against-history.md
 * decisions/040-cup-analytics.md
 * decisions/531-comments-say-what-code-is-for.md
 */
export async function getTeamSeasonComparison(
  competitionCode: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number,
  seasons: readonly TeamSeason[]
): Promise<SeasonComparisonSeries> {
  try {
    return await comparisonFor(
      teamProviderId,
      { competitionCode, seasonId },
      seasons,
      seasonsBeside(competitionCode),
      (key) => readSeasonFor(key.competitionCode, key.seasonId, activeSeasonId, teamProviderId),
      getCompetitionFormat(competitionCode) === "cup" ? UNRANKED_MEASURES : RANKED_MEASURES
    );
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to compare the season with the club's others"
    );
    return { status: "error" };
  }
}

/**
 * This club's records across every stored season. `label` is the page's own
 * season wording, so a record names a season as the selector does.
 *
 * decisions/039-streak-records.md
 */
export function getTeamStreakRecords(
  competitionCode: string,
  teamProviderId: number,
  activeSeasonId: number,
  seasons: readonly TeamSeason[],
  label: (seasonId: number) => string
): Promise<StreakRecordsSeries> {
  return recordsFor(
    teamProviderId,
    seasons,
    seasonsBeside(competitionCode),
    label,
    (key) => readSeasonFor(key.competitionCode, key.seasonId, activeSeasonId, teamProviderId),
    competitionScope
  ).catch((error) => {
    logger.error({ err: error, teamProviderId }, "Unable to read the club's streak records");
    return { status: "error" as const };
  });
}

/**
 * Which of the club's seasons belong beside this one: its league seasons across
 * divisions, or for a cup only that cup's (specs/040, S5).
 */
function seasonsBeside(competitionCode: string): (code: string) => boolean {
  return getCompetitionFormat(competitionCode) === "cup"
    ? (code) => code === competitionCode
    : isLeagueCompetition;
}

/**
 * A competition the registry knows to be a league: `getCompetitionFormat` calls
 * an unknown code one, and stored rows can outlive their registry entry.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
function isLeagueCompetition(competitionCode: string): boolean {
  return (
    regionOfCompetition(competitionCode) !== null &&
    getCompetitionFormat(competitionCode) === "league"
  );
}

/**
 * One season as `compareSeasons` needs it: nothing stored is `empty`, a failed
 * refresh with nothing stored `error`, and stale rows are served (specs/038, S12).
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
async function readSeasonFor(
  competitionCode: string,
  seasonId: number,
  activeSeasonId: number,
  teamProviderId: number
): Promise<SeasonReadResult> {
  const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
    competitionCode,
    seasonId,
    activeSeasonId
  );
  if (seasonMatches.length === 0) {
    return refreshFailed ? { status: "error" } : { status: "empty" };
  }

  const finished = toFinishedMatches(seasonMatches);
  const series = singleTableSeries(finished, seasonMatches, teamProviderId);

  return {
    status: "ok",
    read: {
      competition: getCompetitionName(competitionCode),
      finished,
      all: seasonMatches,
      points: series.status === "ok" ? series.points : [],
      teamCount: series.status === "ok" ? series.teamCount : 0,
    },
  };
}

/**
 * A team's full match list for a season, by kickoff. With no teams table, an id
 * in no stored match is `"not_found"`. `cache()`d for the metadata and the page.
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

    const teamMatches = selectTeamMatches(seasonMatches, teamProviderId);

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
 * Every match of one round of a season, through the same sync; without a
 * `round`, the season's current one.
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

export type CupSeasonResult =
  | { status: "ok"; matches: NormalizedProviderMatch[] }
  | { status: "empty" }
  | { status: "error" };

/**
 * A cup season's full match list, every stage, from which its page derives
 * everything. `cache()`d for the metadata and the page.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export const getCupSeason = cache(async function getCupSeason(
  competitionCode: string,
  seasonId: number,
  activeSeasonId: number
): Promise<CupSeasonResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );

    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error" } : { status: "empty" };
    }
    return { status: "ok", matches: seasonMatches };
  } catch (error) {
    logger.error({ err: error, competitionCode, seasonId }, "Unable to load cup season");
    return { status: "error" };
  }
});

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
 * Whether to ask the provider: a season with nothing stored, or a stale active
 * one. `storedMatches` must be ordered newest `updatedAt` first.
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

/**
 * Each completed season's table movement in one foreign competition, from
 * stored rows only, never asking the provider (specs/050, S4).
 */
export async function getSeasonMovements(
  competitionCode: string,
  activeSeasonId: number
): Promise<SeasonMovement[]> {
  const stored = await db
    .select()
    .from(matches)
    .where(and(eq(matches.competitionCode, competitionCode), lt(matches.seasonId, activeSeasonId)))
    .orderBy(desc(matches.updatedAt));

  const seasons = Map.groupBy(stored, (match) => match.seasonId);
  return [...seasons].map(([seasonId, seasonMatches]) => ({
    seasonId,
    movement: singleTableMovement(toFinishedMatches(seasonMatches), seasonMatches),
  }));
}

function toResult(standings: TeamStanding[]): StandingsResult {
  return standings.length > 0 ? { status: "ok", standings } : { status: "empty", standings: [] };
}

/** Every season we hold matches for in one foreign competition, asked here as this owns `matches`. */
export async function storedForeignSeasons(competitionCode: string): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ seasonId: matches.seasonId })
    .from(matches)
    .where(eq(matches.competitionCode, competitionCode));
  return new Set(rows.map((row) => row.seasonId));
}

export async function synchronizeMatches(
  providerMatches: NormalizedProviderMatch[],
  /** The transaction to join, when a caller has one. Defaults to its own. */
  executor: Executor = db
): Promise<void> {
  if (providerMatches.length === 0) return;

  await executor
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
        halfTimeHome: sql`excluded.half_time_home`,
        halfTimeAway: sql`excluded.half_time_away`,
        stage: sql`excluded.stage`,
        groupName: sql`excluded.group_name`,
        regularTimeHome: sql`excluded.regular_time_home`,
        regularTimeAway: sql`excluded.regular_time_away`,
        extraTimeHome: sql`excluded.extra_time_home`,
        extraTimeAway: sql`excluded.extra_time_away`,
        penaltiesHome: sql`excluded.penalties_home`,
        penaltiesAway: sql`excluded.penalties_away`,
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
