/**
 * TASO's API as this app reads it: the requests it makes, and their rows
 * normalised for storage.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 */

import { getCached } from "./cache";
import { logger } from "./logger";
import { fetchProviderJson } from "./provider-request";

const API_BASE_URL = "https://spl.torneopal.net/taso/rest";

/**
 * How long a season's match list stays cached: long enough that a page does not
 * re-ask, short enough that a live result is not stale for long.
 *
 * decisions/009-veikkausliiga.md
 * decisions/200-taso-read-cache.md
 */
const MATCHES_CACHE_TTL_SECONDS = 15 * 60;
const GROUPS_CACHE_TTL_SECONDS = 15 * 60;

/**
 * The Redis key one category's season of matches is cached under.
 *
 * decisions/029-forced-season-refresh.md
 */
export function tasoMatchesCacheKey(competitionId: string, categoryId: string): string {
  return `taso:matches:${competitionId}:${categoryId}`;
}

/**
 * The Redis key one category's season of groups is cached under.
 *
 * decisions/029-forced-season-refresh.md
 */
export function tasoCategoryCacheKey(competitionId: string, categoryId: string): string {
  return `taso:category:${competitionId}:${categoryId}`;
}

/**
 * How long one TASO request waits before a page render gives up on it. Insurance
 * against a stalled provider, not a latency budget; `/api/health` passes its
 * own, shorter signal on top.
 *
 * decisions/363-render-timeouts.md
 */
const RENDER_TIMEOUT_MS = 10000;

// Fixed values, not secrets: TASO answers 403 without headers matching its own
// frontend, a server-side origin check that server-to-server requests meet too.
const REFERER = "https://tulospalvelu.palloliitto.fi/";
const ORIGIN = "https://tulospalvelu.palloliitto.fi";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function apiKey(): string {
  const key = process.env.TASO_API_KEY;
  if (!key) throw new Error("TASO_API_KEY is not configured");
  return key;
}

/**
 * One TASO request, with the headers its origin check wants and a bound on how
 * long it waits.
 *
 * decisions/009-veikkausliiga.md
 * decisions/363-render-timeouts.md
 */
function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetchProviderJson<T>(
    "TASO",
    API_BASE_URL,
    path,
    () => ({
      Accept: `json/${apiKey()}`,
      Referer: REFERER,
      Origin: ORIGIN,
      "User-Agent": USER_AGENT,
    }),
    signal,
    // One bound for every TASO request, since they all pass through here.
    RENDER_TIMEOUT_MS
  );
}

// --- Matches -----------------------------------------------------------

/**
 * One match as TASO sends it. Every field is a JSON string, the numeric-looking
 * ones too, and an unplayed match's `fs_A`/`fs_B` is `""`, not `null` or `"0"`.
 *
 * decisions/009-veikkausliiga.md
 * decisions/036-halftime-comebacks.md
 */
export type TasoProviderMatch = {
  match_id?: string;
  status?: string; // TASO's own word: see `normalizeStatus`
  winner?: string; // "Home" | "Away" | "Tie", absent until the match is played
  round_id?: string;
  group_id?: string;
  group_name?: string;
  date?: string; // "YYYY-MM-DD"
  time?: string; // "HH:MM:SS", local to time_zone_offset
  time_zone_offset?: string; // "+0300" / "+0200" (EEST/EET), per-match — reflects DST correctly
  team_A_id?: string;
  team_A_name?: string;
  team_B_id?: string;
  team_B_name?: string;
  fs_A?: string;
  fs_B?: string;
  // The half-time score, in the same string-or-empty shape as `fs_*`.
  hts_A?: string;
  hts_B?: string;
};

type MatchesResponse = { matches?: TasoProviderMatch[] };

/**
 * A TASO match normalized to the field names `calculateStandings` takes, plus
 * the group it belongs to.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/015-finnish-cups.md
 * decisions/036-halftime-comebacks.md
 */
export type NormalizedTasoMatch = {
  providerMatchId: number;
  competitionCode: string;
  /**
   * Which competition inside the season umbrella this match belongs to.
   * `competitionCode` alone cannot say: every category shares one
   * `competition_id`, and their `group_id`s collide.
   */
  categoryId: string;
  seasonId: number;
  groupId: number;
  groupName: string;
  status: string;
  kickoffAt: Date;
  matchday: number | null;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  /** The half-time score, or null when TASO reports none. */
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  /**
   * Who TASO says went through. The score cannot say for a cup: a tie level after
   * normal time goes to penalties TASO does not itemise. `"tie"` is a league's.
   */
  winner: TasoWinner;
};

/**
 * TASO's own `winner`, lowercased. Null when the match has not been played.
 *
 * decisions/015-finnish-cups.md
 */
export type TasoWinner = "home" | "away" | "tie" | null;

function normalizeWinner(winner: string | undefined): TasoWinner {
  if (winner === "Home") return "home";
  if (winner === "Away") return "away";
  if (winner === "Tie") return "tie";
  return null;
}

/**
 * A kickoff from `date`, `time` and the match's own `time_zone_offset`, or null
 * when they do not make a real instant.
 *
 * decisions/009-veikkausliiga.md
 */
function parseKickoff(date: string, time: string, offset: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})/.exec(time);
  const offsetMatch = /^([+-])(\d{2})(\d{2})$/.exec(offset);
  if (!dateMatch || !timeMatch || !offsetMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const [, sign, offsetHours, offsetMinutes] = offsetMatch;

  // Shaped like a timestamp is not one: out-of-range parts would be normalized
  // into a real but wrong instant.
  if (hour > 23 || minute > 59 || Number(offsetHours) > 23 || Number(offsetMinutes) > 59) {
    return null;
  }

  const localMs = Date.UTC(year, month - 1, day, hour, minute);
  const local = new Date(localMs);
  // Catches an out-of-range month and a day that doesn't exist in its month
  // alike — `Date.UTC` rolls 2026-02-31 forward into March rather than
  // failing, so the only reliable check is that the date round-trips.
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day
  ) {
    return null;
  }

  const offsetTotalMinutes =
    (sign === "-" ? -1 : 1) * (Number(offsetHours) * 60 + Number(offsetMinutes));
  return new Date(localMs - offsetTotalMinutes * 60_000);
}

/**
 * TASO's status as the app's. A walkover (`Forfeited`) is `FINISHED`, as TASO
 * counts it; `Planned` is scheduled; an unknown status passes through verbatim.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 */
function normalizeStatus(status: string): string {
  if (status === "Played" || status === "Forfeited") return "FINISHED";
  if (status === "Fixture" || status === "Planned") return "SCHEDULED";
  return status;
}

/**
 * One TASO match normalized for storage, or `null` for a row that cannot be
 * stored: a missing field, an unusable id, or no kickoff.
 *
 * decisions/009-veikkausliiga.md
 * decisions/010-playoff-group-match-list.md
 * decisions/284-provider-id-validation.md
 */
export function normalizeTasoMatch(
  match: TasoProviderMatch,
  competitionId: string,
  categoryId: string,
  seasonId: number
): NormalizedTasoMatch | null {
  if (
    match.match_id === undefined ||
    match.status === undefined ||
    match.date === undefined ||
    match.time === undefined ||
    match.time_zone_offset === undefined ||
    match.group_id === undefined ||
    match.group_name === undefined ||
    match.team_A_id === undefined ||
    match.team_A_name === undefined ||
    match.team_B_id === undefined ||
    match.team_B_name === undefined
  )
    return null;

  // The four ids the row is stored under. A row with an unusable one is skipped:
  // it is worth less than the season.
  const providerMatchId = parseProviderId(match.match_id);
  const groupId = parseProviderId(match.group_id);
  const homeTeamProviderId = parseProviderId(match.team_A_id);
  const awayTeamProviderId = parseProviderId(match.team_B_id);
  if (
    providerMatchId === null ||
    groupId === null ||
    homeTeamProviderId === null ||
    awayTeamProviderId === null
  ) {
    logger.warn(
      {
        matchId: match.match_id,
        groupId: match.group_id,
        homeTeamId: match.team_A_id,
        awayTeamId: match.team_B_id,
      },
      "Skipping TASO match with an unusable id"
    );
    return null;
  }

  // A dateless row is a two-legged final's aggregate, not a fixture. The empty
  // date is all that marks it, so it is skipped here.
  const kickoffAt = parseKickoff(match.date, match.time, match.time_zone_offset);
  if (kickoffAt === null) {
    logger.warn(
      { matchId: match.match_id, date: match.date, time: match.time },
      "Skipping TASO match with an unparseable kickoff"
    );
    return null;
  }

  return {
    providerMatchId,
    competitionCode: competitionId,
    categoryId,
    seasonId,
    groupId,
    groupName: match.group_name,
    status: normalizeStatus(match.status),
    kickoffAt,
    // Not an identity, so an unusable round costs the round rather than the
    // row — which is the same thing an absent one costs.
    matchday: optionalNumber(match.round_id),
    homeTeamProviderId,
    homeTeamName: match.team_A_name,
    awayTeamProviderId,
    awayTeamName: match.team_B_name,
    // `""` and `undefined` both mean no score yet, which `optionalNumber` answers.
    homeGoals: optionalNumber(match.fs_A),
    awayGoals: optionalNumber(match.fs_B),
    // Same rule: `""` is no half-time score, which is not 0–0.
    halfTimeHome: optionalNumber(match.hts_A),
    halfTimeAway: optionalNumber(match.hts_B),
    winner: normalizeWinner(match.winner),
  };
}

/**
 * Every match TASO has for one category's season, whatever its group or status.
 * `seasonId` is passed in, never derived from `competitionId`. The category is
 * part of the request: `group_id`s collide across a season's categories.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/017-huuhkajat.md
 * decisions/200-taso-read-cache.md
 */
export async function getSeasonMatches(
  competitionId: string,
  categoryId: string,
  seasonId: number
): Promise<NormalizedTasoMatch[]> {
  // Cached: a pair with no matches stores no rows, so without this an empty
  // answer is asked again on every request.
  const response = await getCached<MatchesResponse>(
    tasoMatchesCacheKey(competitionId, categoryId),
    MATCHES_CACHE_TTL_SECONDS,
    () =>
      request<MatchesResponse>(
        `/getMatches?competition_id=${competitionId}&category_id=${categoryId}`
      )
  );
  return (response.matches ?? []).flatMap((match) => {
    const normalized = normalizeTasoMatch(match, competitionId, categoryId, seasonId);
    return normalized ? [normalized] : [];
  });
}

/**
 * The oldest season the app offers. Configured: TASO lists only currently
 * published competitions, so it cannot say what seasons have existed.
 *
 * decisions/009-veikkausliiga.md
 * decisions/011-current-season-discovery.md
 */
export const EARLIEST_TASO_SEASON = 2015;

// --- Competitions (season discovery) -----------------------------------

export type TasoCompetition = {
  competition_id?: string;
  competition_status?: string;
  season_id?: number | string;
};

type CompetitionsResponse = { competitions?: TasoCompetition[] };

/**
 * The id of a whole season of Finnish football, which every category shares.
 * The exact shape matters: `spljphhl26` is another competition with the prefix.
 *
 * decisions/011-current-season-discovery.md
 */
const SEASON_COMPETITION_ID = /^spljp\d{2}$/;

/**
 * The newest published Finnish football season, or `null` when TASO
 * publishes none this call can recognize. Callers decide how to fall back.
 *
 * decisions/011-current-season-discovery.md
 */
export async function getCurrentSeason(signal?: AbortSignal): Promise<number | null> {
  const response = await request<CompetitionsResponse>("/getCompetitions", signal);
  const seasons = (response.competitions ?? [])
    .filter(
      (competition) =>
        competition.competition_id !== undefined &&
        SEASON_COMPETITION_ID.test(competition.competition_id) &&
        competition.competition_status === "published"
    )
    .map((competition) => Number(competition.season_id))
    .filter((seasonId) => Number.isInteger(seasonId));

  return seasons.length === 0 ? null : Math.max(...seasons);
}

// --- Categories (per-season names) --------------------------------------

export type TasoCategory = {
  category_id?: string;
  category_name?: string;
};

type CategoriesResponse = { categories?: TasoCategory[] };

/**
 * Every category in one season, as `category_id → category_name`: a competition's
 * name changes between seasons, and a page shows the one that season carried.
 *
 * decisions/013-more-finnish-competitions.md
 */
export async function getSeasonCategoryNames(
  competitionId: string
): Promise<Record<string, string>> {
  const response = await request<CategoriesResponse>(
    `/getCategories?competition_id=${competitionId}`
  );

  const names: Record<string, string> = {};
  for (const category of response.categories ?? []) {
    if (category.category_id !== undefined && category.category_name !== undefined) {
      names[category.category_id] = category.category_name;
    }
  }
  return names;
}

// --- Groups (precomputed standings) ------------------------------------

/**
 * One team's row in a group, as TASO sends it: numbers for the stats, strings for
 * `team_id` and `final_group_standing`. A knockout group omits the stat fields.
 *
 * decisions/009-veikkausliiga.md
 * decisions/010-playoff-group-match-list.md
 */
export type TasoGroupTeam = {
  team_id?: string;
  team_name?: string;
  matches_played?: number | null;
  matches_won?: number | null;
  matches_tied?: number | null;
  matches_lost?: number | null;
  goals_for?: number | null;
  goals_against?: number | null;
  goals_diff?: number | null;
  points?: number | null;
  starting_points?: number | null;
  current_standing?: number | null;
  final_group_standing?: string | null;
};

/**
 * One group as TASO sends it, with its teams' rows.
 *
 * decisions/009-veikkausliiga.md
 * decisions/281-missing-carry-over-entry.md
 */
export type TasoGroup = {
  group_id?: string;
  group_name?: string;
  phase_number?: string;
  category_notice?: string;
  /**
   * What TASO says the group is: `group_stage` a first round,
   * `additional_group_stage` a continuation, `knockout_final` a cup bracket.
   */
  group_type?: string;
  /**
   * The group a continuation inherits from, when TASO says. A hint for a log, not
   * a source for the mapping: older seasons report `"0"`.
   */
  import_match_group_id?: string;
  teams?: TasoGroupTeam[];
};

/**
 * `getCategory`'s shape: the groups sit under `category`.
 *
 * decisions/272-group-standings-endpoint.md
 */
type CategoryResponse = { category?: { groups?: TasoGroup[] } };

/**
 * One team's row in a group, flattened and typed for storage. `startingPoints` is
 * why it exists: standings are wrong without it.
 *
 * decisions/013-more-finnish-competitions.md
 */
export type NormalizedTasoGroupTeam = {
  categoryId: string;
  competitionCode: string;
  seasonId: number;
  groupId: number;
  teamProviderId: number;
  teamName: string;
  startingPoints: number | null;
  points: number | null;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDifference: number | null;
  currentStanding: number | null;
  finalGroupStanding: number | null;
};

/**
 * The range a Postgres `integer` column holds, which is every numeric column
 * these normalisers feed.
 *
 * decisions/284-provider-id-validation.md
 */
const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;

/**
 * One numeric field as TASO reported it, or `null` when it reported nothing
 * usable: a string is a decimal integer the column can hold, or it is nothing.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/284-provider-id-validation.md
 */
function optionalNumber(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && !/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < INT4_MIN || parsed > INT4_MAX) return null;
  return parsed;
}

/**
 * A TASO id (a match, a group, a team), or `null`: a positive decimal integer the
 * column can hold, or it is not an id.
 *
 * decisions/284-provider-id-validation.md
 */
export function parseProviderId(value: number | string | null | undefined): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/**
 * Flattens the groups into one row per team per group. A group with no teams
 * contributes none, which is what marks it as having no table.
 *
 * decisions/013-more-finnish-competitions.md
 */
export function normalizeGroupTeams(
  groups: TasoGroup[],
  categoryId: string,
  competitionId: string,
  seasonId: number
): NormalizedTasoGroupTeam[] {
  return groups.flatMap((group) => {
    // Validated here rather than only where the group is *reported on*: this
    // is the path that reaches the database, so an id that is not an id must
    // be dropped before it becomes a stored row under a made-up key.
    const groupId = parseProviderId(group.group_id);
    if (groupId === null) return [];

    return (group.teams ?? []).flatMap((team) => {
      const teamProviderId = parseProviderId(team.team_id);
      if (teamProviderId === null) return [];

      return [
        {
          categoryId,
          competitionCode: competitionId,
          seasonId,
          groupId,
          teamProviderId,
          teamName: team.team_name ?? "",
          startingPoints: optionalNumber(team.starting_points),
          points: optionalNumber(team.points),
          played: optionalNumber(team.matches_played),
          won: optionalNumber(team.matches_won),
          drawn: optionalNumber(team.matches_tied),
          lost: optionalNumber(team.matches_lost),
          goalsFor: optionalNumber(team.goals_for),
          goalsAgainst: optionalNumber(team.goals_against),
          goalDifference: optionalNumber(team.goals_diff),
          currentStanding: optionalNumber(team.current_standing),
          finalGroupStanding: optionalNumber(team.final_group_standing),
        },
      ];
    });
  });
}

/**
 * Every group TASO returns for one category's season, with its own precomputed
 * standings. Read from `getCategory`: TASO refuses `getGroups`. The category is
 * part of the request, as for `getSeasonMatches`.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/272-group-standings-endpoint.md
 */
export async function getSeasonGroups(
  competitionId: string,
  categoryId: string
): Promise<TasoGroup[]> {
  const response = await getCached<CategoryResponse>(
    tasoCategoryCacheKey(competitionId, categoryId),
    GROUPS_CACHE_TTL_SECONDS,
    () =>
      request<CategoryResponse>(
        `/getCategory?competition_id=${competitionId}&category_id=${categoryId}`
      )
  );
  return response.category?.groups ?? [];
}
