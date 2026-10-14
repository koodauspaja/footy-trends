/**
 * football-data.org as this app reads it: a competition's seasons, a season's
 * matches, and their rows normalised for storage.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/002-season-selector-and-backfill.md
 * decisions/014-champions-league.md
 * decisions/016-world-cup-and-euro.md
 * decisions/036-halftime-comebacks.md
 */

import { cache } from "react";
import { getCached } from "./cache";
import { earliestSeasonFor } from "./competitions";
import { fetchProviderJson } from "./provider-request";
import { listSelectableSeasons, resolveEarliestSeason, type SeasonOption } from "./seasons";

const API_BASE_URL = "https://api.football-data.org/v4";
export const COMPETITION_CACHE_TTL_SECONDS = 60 * 60;
export const MATCHES_CACHE_TTL_SECONDS = 15 * 60;

/**
 * The Redis key a season's matches are cached under.
 *
 * decisions/029-forced-season-refresh.md
 */
export function footballDataMatchesCacheKey(competitionCode: string, seasonId: number): string {
  return `football-data:matches:${competitionCode}:${seasonId}`;
}

type ProviderTeam = { id?: number; name?: string };

type ProviderScoreLine = { home?: number | null; away?: number | null };

export type ProviderMatch = {
  id?: number;
  utcDate?: string;
  status?: string;
  matchday?: number | null;
  /** Cup competitions only, e.g. "LEAGUE_STAGE" | "LAST_16" | "FINAL". */
  stage?: string | null;
  /** Group-stage seasons only, e.g. "GROUP_A". */
  group?: string | null;
  homeTeam?: ProviderTeam;
  awayTeam?: ProviderTeam;
  score?: {
    fullTime?: ProviderScoreLine;
    /** The score at the break, given for league matches too. */
    halfTime?: ProviderScoreLine;
    // `fullTime` includes a penalty shoot-out, so a two-legged tie is aggregated
    // from `regularTime` and `extraTime`.
    regularTime?: ProviderScoreLine;
    extraTime?: ProviderScoreLine;
    penalties?: ProviderScoreLine;
  };
};

export type ProviderSeason = { id?: number; startDate?: string; endDate?: string };
type CompetitionResponse = { currentSeason?: ProviderSeason; seasons?: ProviderSeason[] };
type MatchesResponse = { matches?: ProviderMatch[] };

function apiKey(): string {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not configured");
  return key;
}

/**
 * How long one football-data request waits before a page render gives up on
 * it. It bounds one attempt, not the wait after a 429.
 *
 * decisions/363-render-timeouts.md
 */
const RENDER_TIMEOUT_MS = 8000;

function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetchProviderJson<T>(
    "Football data",
    API_BASE_URL,
    path,
    () => ({ "X-Auth-Token": apiKey() }),
    signal,
    // Every football-data request goes through here, so one value bounds them
    // all; a caller with its own deadline still bounds the whole call.
    RENDER_TIMEOUT_MS
  );
}

export type SeasonContext = {
  /** The newest season that has already started; the default the home page shows. */
  activeSeasonId: number;
  /** Newest first, bounded by `FOOTBALL_DATA_EARLIEST_SEASON`. */
  selectableSeasons: SeasonOption[];
  /**
   * Whether a season runs across two calendar years, read from the provider's
   * own dates.
   */
  spansCalendarYears: boolean;
};

/**
 * The active season and the seasons a reader may select, from one cached
 * competition response. `cache()`d, so a page and its metadata share the call.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/002-season-selector-and-backfill.md
 */
export const getSeasonContext = cache(async (competitionCode: string): Promise<SeasonContext> => {
  const competition = await getCached<CompetitionResponse>(
    `football-data:competition:${competitionCode}:v2`,
    COMPETITION_CACHE_TTL_SECONDS,
    () => request<CompetitionResponse>(`/competitions/${competitionCode}`)
  );
  const now = new Date();
  const activeSeason = selectActiveSeason(competition, now);
  const startDate = activeSeason?.startDate;
  if (startDate === undefined) throw new Error("Football data response has no current season");
  // The matches endpoint's `season` parameter is the season's start year, not the
  // season object's `id`.
  const activeSeasonId = new Date(startDate).getUTCFullYear();
  const earliestSeason = earliestSeasonFor(
    competitionCode,
    resolveEarliestSeason(process.env.FOOTBALL_DATA_EARLIEST_SEASON)
  );
  const upcomingStartDate = selectUpcomingSeason(competition, now)?.startDate;
  const upcomingSeasonId =
    upcomingStartDate === undefined ? undefined : new Date(upcomingStartDate).getUTCFullYear();

  const spansCalendarYears = seasonSpansCalendarYears(activeSeason);

  return {
    activeSeasonId,
    selectableSeasons: listSelectableSeasons(
      activeSeasonId,
      earliestSeason,
      upcomingSeasonId,
      spansCalendarYears
    ),
    spansCalendarYears,
  };
});

/**
 * Whether the season's own dates cross a calendar-year boundary. A season with
 * no end date is treated as spanning, as every league does.
 *
 * decisions/016-world-cup-and-euro.md
 */
export function seasonSpansCalendarYears(season: ProviderSeason | undefined): boolean {
  if (season?.startDate === undefined || season.endDate === undefined) return true;
  return new Date(season.startDate).getUTCFullYear() !== new Date(season.endDate).getUTCFullYear();
}

export function selectActiveSeason(
  competition: { currentSeason?: ProviderSeason; seasons?: ProviderSeason[] },
  now: Date
): ProviderSeason | undefined {
  const seasons = [competition.currentSeason, ...(competition.seasons ?? [])].filter(
    (season): season is ProviderSeason => season?.id !== undefined
  );
  const startedSeasons = seasons.filter(
    (season) => season.startDate === undefined || new Date(season.startDate) <= now
  );
  return startedSeasons.toSorted((left, right) => {
    const leftStart = left.startDate ? new Date(left.startDate).getTime() : 0;
    const rightStart = right.startDate ? new Date(right.startDate).getTime() : 0;
    return rightStart - leftStart;
  })[0];
}

/**
 * The provider's next season by `startDate`, once it is listed, even before
 * it starts. An undated season is never upcoming.
 *
 * decisions/005-listing-matches-for-selected-season.md
 */
export function selectUpcomingSeason(
  competition: { currentSeason?: ProviderSeason; seasons?: ProviderSeason[] },
  now: Date
): ProviderSeason | undefined {
  const seasons = [competition.currentSeason, ...(competition.seasons ?? [])].filter(
    (season): season is ProviderSeason & { startDate: string } =>
      season?.id !== undefined && season.startDate !== undefined && new Date(season.startDate) > now
  );
  return seasons.toSorted(
    (left, right) => new Date(left.startDate).getTime() - new Date(right.startDate).getTime()
  )[0];
}

/**
 * Every match for the season regardless of status: played and upcoming alike.
 *
 * decisions/004-listing-matches-for-selected-team.md
 */
export async function getSeasonMatches(
  competitionCode: string,
  seasonId: number
): Promise<NormalizedProviderMatch[]> {
  const response = await getCached<MatchesResponse>(
    footballDataMatchesCacheKey(competitionCode, seasonId),
    MATCHES_CACHE_TTL_SECONDS,
    () => request<MatchesResponse>(`/competitions/${competitionCode}/matches?season=${seasonId}`)
  );
  return (response.matches ?? []).flatMap((match) => {
    const normalized = normalizeMatch(match, seasonId, competitionCode);
    return normalized ? [normalized] : [];
  });
}

export type NormalizedProviderMatch = {
  providerMatchId: number;
  // string rather than the literal "PL": lets a DB row (typeof matches.$inferSelect,
  // whose competitionCode column is plain text) structurally satisfy this type too,
  // so standings-service.ts can treat provider- and DB-sourced matches uniformly.
  competitionCode: string;
  seasonId: number;
  status: string;
  kickoffAt: Date;
  matchday: number | null;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  /** Only set once the provider reports a final score, e.g. once `status` is `"FINISHED"`. */
  homeGoals: number | null;
  awayGoals: number | null;
  /** Null for a league competition, whose matches carry no stage. */
  stage: string | null;
  // Named for the DB column (`group` is reserved in SQL), not for the
  // provider's `group` field — the whole point of this type is that a selected
  // `matches` row satisfies it structurally, with no mapping step.
  /** Null outside a group stage — including every match of a LEAGUE_STAGE season. */
  groupName: string | null;
  /**
   * The half-time score, null when the provider reports none. Given for league
   * matches too, but not for a season outside the plan's window.
   */
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  // The score breakdown, null whenever the provider omits it. Stored, so the
  // bracket still renders from the database when the provider is unreachable.
  regularTimeHome: number | null;
  regularTimeAway: number | null;
  extraTimeHome: number | null;
  extraTimeAway: number | null;
  penaltiesHome: number | null;
  penaltiesAway: number | null;
};

export function normalizeMatch(
  match: ProviderMatch,
  seasonId: number,
  competitionCode: string
): NormalizedProviderMatch | null {
  if (
    match.id === undefined ||
    match.status === undefined ||
    match.utcDate === undefined ||
    match.homeTeam?.id === undefined ||
    match.homeTeam.name === undefined ||
    match.awayTeam?.id === undefined ||
    match.awayTeam.name === undefined
  )
    return null;

  return {
    providerMatchId: match.id,
    competitionCode,
    seasonId,
    status: match.status,
    kickoffAt: new Date(match.utcDate),
    matchday: match.matchday ?? null,
    homeTeamProviderId: match.homeTeam.id,
    homeTeamName: match.homeTeam.name,
    awayTeamProviderId: match.awayTeam.id,
    awayTeamName: match.awayTeam.name,
    // Deliberately still `fullTime`: changing this would move every league
    // competition's standings. The shootout-inflated value only matters to
    // the bracket, which reads the breakdown below instead.
    homeGoals: match.score?.fullTime?.home ?? null,
    awayGoals: match.score?.fullTime?.away ?? null,
    stage: match.stage ?? null,
    groupName: match.group ?? null,
    // `??`, not `||`: a goalless first half is 0, which is a score.
    halfTimeHome: match.score?.halfTime?.home ?? null,
    halfTimeAway: match.score?.halfTime?.away ?? null,
    regularTimeHome: match.score?.regularTime?.home ?? null,
    regularTimeAway: match.score?.regularTime?.away ?? null,
    extraTimeHome: match.score?.extraTime?.home ?? null,
    extraTimeAway: match.score?.extraTime?.away ?? null,
    penaltiesHome: match.score?.penalties?.home ?? null,
    penaltiesAway: match.score?.penalties?.away ?? null,
  };
}
