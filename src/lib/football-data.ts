import { cache } from "react";
import { getCached } from "./cache";
import { earliestSeasonFor } from "./competitions";
import { fetchProviderJson } from "./provider-request";
import { listSelectableSeasons, resolveEarliestSeason, type SeasonOption } from "./seasons";

const API_BASE_URL = "https://api.football-data.org/v4";
export const COMPETITION_CACHE_TTL_SECONDS = 60 * 60;
export const MATCHES_CACHE_TTL_SECONDS = 15 * 60;

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
    // `fullTime` INCLUDES a penalty shootout: Liverpool "1-5" PSG (LAST_16,
    // 2024/25) is really 0-1 with penalties 1-4. Anything aggregating a
    // two-legged tie must use `regularTime` + `extraTime` instead, which is
    // why the breakdown is carried through rather than dropped here. See
    // specs/014-champions-league.md.
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

function request<T>(path: string): Promise<T> {
  return fetchProviderJson<T>("Football data", API_BASE_URL, path, () => ({
    "X-Auth-Token": apiKey(),
  }));
}

export type SeasonContext = {
  /** The newest season that has already started; the default the home page shows. */
  activeSeasonId: number;
  /** Newest first, bounded by `FOOTBALL_DATA_EARLIEST_SEASON`. */
  selectableSeasons: SeasonOption[];
  /**
   * Whether a season runs across two calendar years, read from the provider's
   * own dates rather than assumed. A league does; a tournament played inside
   * one summer does not, and labelling the 2026 World Cup "2026/27" would
   * claim a season it never had.
   */
  spansCalendarYears: boolean;
};

/**
 * Resolves the active season and the seasons the user may select, from a single
 * cached competition response.
 *
 * The provider's `seasons[]` array is deliberately not used to build the
 * selectable list: it advertises seasons back to 1888 that the API plan rejects
 * with 403. See specs/002-season-selector-and-backfill.md.
 *
 * Wrapped in React's `cache()` so a page's `generateMetadata` and its default
 * export — both of which resolve the same competition's season context —
 * share one call per request instead of hitting Redis/the provider twice.
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
  // The matches endpoint's `season` query parameter is the season's start year
  // (e.g. 2025), not the season object's `id` field (e.g. 2403) — confirmed
  // against the live API, which 404s when passed the `id`.
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
 * no end date is treated as spanning, which is what every league does and what
 * the app assumed before tournaments existed.
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
 * The provider's next season by `startDate`, once it has one already listed
 * — even before it starts. Unlike `selectActiveSeason`, an undated season is
 * never "upcoming" (there is nothing to compare against `now`).
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

/** Returns every match for the season regardless of status — played and upcoming alike. */
export async function getSeasonMatches(
  competitionCode: string,
  seasonId: number
): Promise<NormalizedProviderMatch[]> {
  const response = await getCached<MatchesResponse>(
    `football-data:matches:${competitionCode}:${seasonId}`,
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
  // The score breakdown, null whenever the provider omits it (every league
  // match, and any cup match decided in normal time). Stored rather than
  // recomputed so the bracket still renders from the database when the
  // provider is unreachable.
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
    regularTimeHome: match.score?.regularTime?.home ?? null,
    regularTimeAway: match.score?.regularTime?.away ?? null,
    extraTimeHome: match.score?.extraTime?.home ?? null,
    extraTimeAway: match.score?.extraTime?.away ?? null,
    penaltiesHome: match.score?.penalties?.home ?? null,
    penaltiesAway: match.score?.penalties?.away ?? null,
  };
}
