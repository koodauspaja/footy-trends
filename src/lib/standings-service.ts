import { and, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db, type Executor } from "@/db";
import { matches } from "@/db/schema";
import { type CleanSheetSeries, cleanSheetSeries } from "./clean-sheets";
import { getSeasonMatches, type NormalizedProviderMatch } from "./football-data";
import { type FormSeries, formSeries } from "./form-series";
import { type GoalsSeries, goalsSeries } from "./goals-series";
import { type HomeAwaySeries, homeAwayStats } from "./home-away";
import { logger } from "./logger";
import { type PositionSeries, singleTableSeries } from "./position-series";
import { redis } from "./redis";
import { resolveCurrentRound } from "./rounds";
import {
  calculateStandings,
  selectTeamMatches,
  type TeamStanding,
  toFinishedMatches,
} from "./standings";

const STANDINGS_CACHE_TTL_SECONDS = 15 * 60;

/**
 * The Redis key a competition-season's *computed* table caches under.
 *
 * Exported because a forced refresh has to clear it too, and this is the one
 * that is easy to miss: the database write genuinely succeeds, so without
 * clearing this the page keeps serving the old standings for up to fifteen
 * minutes after the data is already correct. See
 * specs/029-forced-season-refresh.md.
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
 * Reads a season's stored matches and refreshes them from the provider when
 * stale, per `needsRefresh`. Shared by `getStandings` and
 * `getTeamMatches` so both see the same season data through one sync path —
 * see specs/004-listing-matches-for-selected-team.md.
 *
 * Never throws: a failed refresh falls back to whatever is already stored,
 * with `refreshFailed: true` so callers can distinguish "stale but present"
 * from "genuinely nothing to show" when deciding between an empty and an
 * error result.
 *
 * Wrapped in React's `cache()` since specs/030, the way the TASO service's
 * counterpart already is: the team page reads the season once for its match
 * list, and the position chart asks for the same season in the same request.
 * One read serves both, so the chart adds no database read and no provider
 * request of its own.
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
 * This team's league position after each round of a season, for the team
 * page's chart (specs/030).
 *
 * Reads the season through the same cached sync as `getTeamMatches`, so on the
 * team page it costs no read and no provider request of its own — and never one
 * per round: `getStandings({ round })` is deliberately not used, because it
 * re-reads the season on every call. Each table is `calculateStandings` with
 * the arguments `getStandings({ round })` gives it, so a plotted position always
 * equals the standings page's for that round.
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
 * This team's form after each match of a season, for the team page's chart
 * (specs/031).
 *
 * The same cached season read as `getTeamMatches` and the position chart, so on
 * the team page it costs no read and no provider request of its own. Every
 * finished match of this league season counts, as it does in the standings
 * table's `Vire` column.
 */
export async function getTeamFormSeries(
  competitionCode: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<FormSeries> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0 && refreshFailed) return { status: "error" };

    return formSeries(toFinishedMatches(seasonMatches), teamProviderId);
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to compute the form series"
    );
    return { status: "error" };
  }
}

/**
 * This team's goals scored and conceded across a season, for the team page's
 * two goals charts (specs/032). The same cached season read, and exactly the
 * matches the form chart counts.
 */
export async function getTeamGoalsSeries(
  competitionCode: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<GoalsSeries> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0 && refreshFailed) return { status: "error" };

    return goalsSeries(toFinishedMatches(seasonMatches), teamProviderId);
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to compute the goals series"
    );
    return { status: "error" };
  }
}

/**
 * This team's season split into home and away, for the team page's
 * `Koti- ja vierastilastot` panel (specs/033). The same cached season read, and
 * exactly the matches the form and goals charts count.
 */
export async function getTeamHomeAwaySeries(
  competitionCode: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<HomeAwaySeries> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0 && refreshFailed) return { status: "error" };

    return { status: "ok", ...homeAwayStats(toFinishedMatches(seasonMatches), teamProviderId) };
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to compute the home and away series"
    );
    return { status: "error" };
  }
}

/**
 * How often this team kept a clean sheet, after each match of a season, for the
 * team page's `Nollapelit` chart (specs/034). The same cached season read, and
 * exactly the matches the other result charts count.
 */
export async function getTeamCleanSheetSeries(
  competitionCode: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<CleanSheetSeries> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionCode,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0 && refreshFailed) return { status: "error" };

    return cleanSheetSeries(toFinishedMatches(seasonMatches), teamProviderId);
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to compute the clean-sheet series"
    );
    return { status: "error" };
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

export type CupSeasonResult =
  | { status: "ok"; matches: NormalizedProviderMatch[] }
  | { status: "empty" }
  | { status: "error" };

/**
 * A cup season's full match list — every stage, played and upcoming alike.
 *
 * Cup pages derive everything (phase tables, stage list, bracket) from one
 * match list rather than from three separate queries, because all three answer
 * questions about the same season and the provider returns it in a single
 * response anyway.
 *
 * Wrapped in React's `cache()` for the same reason as `getTeamMatches`: a
 * page's `generateMetadata` and its default export both resolve it.
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

/**
 * Every season this app holds matches for, in one foreign competition.
 *
 * Lives here rather than in `force-refresh.ts` because this module owns the
 * `matches` table: a caller asking "what do we hold" should not have to know
 * which columns answer it. See specs/029-forced-season-refresh.md.
 */
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
