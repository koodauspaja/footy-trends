import { getCached } from "./cache";
import { logger } from "./logger";
import { listSelectableSeasons, resolveEarliestSeason, type SeasonOption } from "./seasons";

const API_BASE_URL = "https://api.football-data.org/v4";
export const COMPETITION_CACHE_TTL_SECONDS = 60 * 60;
export const MATCHES_CACHE_TTL_SECONDS = 15 * 60;

type ProviderTeam = { id?: number; name?: string };

export type ProviderMatch = {
  id?: number;
  utcDate?: string;
  status?: string;
  matchday?: number | null;
  homeTeam?: ProviderTeam;
  awayTeam?: ProviderTeam;
  score?: { fullTime?: { home?: number | null; away?: number | null } };
};

export type ProviderSeason = { id?: number; startDate?: string; endDate?: string };
type CompetitionResponse = { currentSeason?: ProviderSeason; seasons?: ProviderSeason[] };
type MatchesResponse = { matches?: ProviderMatch[] };

function apiKey(): string {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not configured");
  return key;
}

async function request<T>(path: string): Promise<T> {
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "X-Auth-Token": apiKey() },
    });
  } catch (error) {
    logger.error(
      { err: error, method: "GET", path, durationMs: Date.now() - startedAt },
      "Football data request failed"
    );
    throw error;
  }

  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    logger.error(
      { method: "GET", path, status: response.status, durationMs },
      "Football data request failed"
    );
    throw new Error(`Football data request failed: ${response.status}`);
  }

  logger.info(
    { method: "GET", path, status: response.status, durationMs },
    "Football data request completed"
  );
  return (await response.json()) as T;
}

export type SeasonContext = {
  /** The newest season that has already started; the default the home page shows. */
  activeSeasonId: number;
  /** Newest first, bounded by `FOOTBALL_DATA_EARLIEST_SEASON`. */
  selectableSeasons: SeasonOption[];
};

/**
 * Resolves the active season and the seasons the user may select, from a single
 * cached competition response.
 *
 * The provider's `seasons[]` array is deliberately not used to build the
 * selectable list: it advertises seasons back to 1888 that the API plan rejects
 * with 403. See specs/002-season-selector-and-backfill.md.
 */
export async function getSeasonContext(): Promise<SeasonContext> {
  const competition = await getCached<CompetitionResponse>(
    "football-data:competition:PL:v2",
    COMPETITION_CACHE_TTL_SECONDS,
    () => request<CompetitionResponse>("/competitions/PL")
  );
  const startDate = selectActiveSeason(competition, new Date())?.startDate;
  if (startDate === undefined) throw new Error("Football data response has no current season");
  // The matches endpoint's `season` query parameter is the season's start year
  // (e.g. 2025), not the season object's `id` field (e.g. 2403) — confirmed
  // against the live API, which 404s when passed the `id`.
  const activeSeasonId = new Date(startDate).getUTCFullYear();
  const earliestSeason = resolveEarliestSeason(process.env.FOOTBALL_DATA_EARLIEST_SEASON);

  return {
    activeSeasonId,
    selectableSeasons: listSelectableSeasons(activeSeasonId, earliestSeason),
  };
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
  return startedSeasons.sort((left, right) => {
    const leftStart = left.startDate ? new Date(left.startDate).getTime() : 0;
    const rightStart = right.startDate ? new Date(right.startDate).getTime() : 0;
    return rightStart - leftStart;
  })[0];
}

/** Returns every match for the season regardless of status — played and upcoming alike. */
export async function getSeasonMatches(seasonId: number): Promise<NormalizedProviderMatch[]> {
  const response = await getCached<MatchesResponse>(
    `football-data:matches:PL:${seasonId}`,
    MATCHES_CACHE_TTL_SECONDS,
    () => request<MatchesResponse>(`/competitions/PL/matches?season=${seasonId}`)
  );
  return (response.matches ?? []).flatMap((match) => {
    const normalized = normalizeMatch(match, seasonId);
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
};

export function normalizeMatch(
  match: ProviderMatch,
  seasonId: number
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
    competitionCode: "PL",
    seasonId,
    status: match.status,
    kickoffAt: new Date(match.utcDate),
    matchday: match.matchday ?? null,
    homeTeamProviderId: match.homeTeam.id,
    homeTeamName: match.homeTeam.name,
    awayTeamProviderId: match.awayTeam.id,
    awayTeamName: match.awayTeam.name,
    homeGoals: match.score?.fullTime?.home ?? null,
    awayGoals: match.score?.fullTime?.away ?? null,
  };
}
