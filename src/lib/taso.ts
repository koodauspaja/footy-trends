import { logger } from "./logger";
import { fetchProviderJson } from "./provider-request";

const API_BASE_URL = "https://spl.torneopal.net/taso/rest";

// Fixed values, not secrets: TASO 403s without headers matching the real
// tulospalvelu.palloliitto.fi frontend — server-side origin validation, not
// browser-enforced CORS, so every server-to-server request needs them too.
// See specs/009-veikkausliiga.md.
const REFERER = "https://tulospalvelu.palloliitto.fi/";
const ORIGIN = "https://tulospalvelu.palloliitto.fi";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// `competition_id` (e.g. "spljp26") alone is the whole SPL Jalkapallo season
// umbrella — cup, women's, youth, and every other category share it, and
// their `group_id`s are NOT globally unique across categories (confirmed
// live: category "KC" also has a `group_id: "1"`, wholly unrelated to
// Veikkausliiga's own group 1). `category_id=VL` is required on every
// request to scope to Veikkausliiga only — omitting it silently mixes in
// other categories' groups/matches under colliding group_ids.
const CATEGORY_ID = "VL";

function apiKey(): string {
  const key = process.env.TASO_API_KEY;
  if (!key) throw new Error("TASO_API_KEY is not configured");
  return key;
}

function request<T>(path: string): Promise<T> {
  return fetchProviderJson<T>("TASO", API_BASE_URL, path, () => ({
    Accept: `json/${apiKey()}`,
    Referer: REFERER,
    Origin: ORIGIN,
    "User-Agent": USER_AGENT,
  }));
}

// --- Matches -----------------------------------------------------------

/**
 * Every field in TASO's raw response is a JSON string, including
 * numeric-looking ones (`match_id`, `group_id`, `round_id`, team ids,
 * scores) — confirmed live against `getMatches`, not assumed. An unplayed
 * match's `fs_A`/`fs_B` is `""`, not `null` and not `"0"`.
 */
export type TasoProviderMatch = {
  match_id?: string;
  status?: string; // "Played" | "Fixture" | "Live", confirmed against live data
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
};

type MatchesResponse = { matches?: TasoProviderMatch[] };

/**
 * The shape every own-calculated group's matches are normalized into —
 * structurally compatible with `NormalizedMatch`/`RosterMatch` from
 * `standings.ts` (same field names), so `calculateStandings` is reused
 * as-is. Extends it with TASO-only `groupId`/`groupName`, needed for
 * per-group tables and the match-list/team-page "which group" label.
 */
export type NormalizedTasoMatch = {
  providerMatchId: number;
  competitionCode: string;
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
};

/**
 * Combines `date` + `time` using the match's own `time_zone_offset` — TASO
 * reports the correct Europe/Helsinki offset per match (`+0300` in summer,
 * `+0200` in winter, confirmed live across the 2025 DST boundary), so no
 * timezone-database lookup is needed here.
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

  // The regexes above only prove the fields are shaped like a timestamp:
  // `2026-99-99 25:00 +0099` matches all three, and `Date.UTC` would
  // silently normalize it into a real-but-wrong instant, storing a match at
  // a kickoff it never had. Out-of-range components are rejected here so
  // such a row is skipped like any other unusable one.
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

/** `""` (an unplayed match's score) and `undefined` both mean "no score yet". */
function parseScore(value: string | undefined): number | null {
  return value === undefined || value === "" ? null : Number(value);
}

/** Any other status (e.g. "Live") passes through verbatim rather than crashing on the unexpected. */
function normalizeStatus(status: string): string {
  if (status === "Played") return "FINISHED";
  if (status === "Fixture") return "SCHEDULED";
  return status;
}

export function normalizeTasoMatch(
  match: TasoProviderMatch,
  competitionId: string,
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

  // TASO returns a dateless row for every two-legged playoff final,
  // holding the tie's aggregate score — confirmed to be exactly the sum of
  // the two legs in 2019, 2022, 2023 and 2024. It is not a fixture and
  // must not render as one, and the empty date/time is the only thing
  // marking it: it carries `status: "Played"` and a real score like any
  // other row. Skipping it here both hides it and keeps one unusable row
  // from taking down a whole season's sync.
  const kickoffAt = parseKickoff(match.date, match.time, match.time_zone_offset);
  if (kickoffAt === null) {
    logger.warn(
      { matchId: match.match_id, date: match.date, time: match.time },
      "Skipping TASO match with an unparseable kickoff"
    );
    return null;
  }

  return {
    providerMatchId: Number(match.match_id),
    competitionCode: competitionId,
    seasonId,
    groupId: Number(match.group_id),
    groupName: match.group_name,
    status: normalizeStatus(match.status),
    kickoffAt,
    matchday: match.round_id === undefined ? null : Number(match.round_id),
    homeTeamProviderId: Number(match.team_A_id),
    homeTeamName: match.team_A_name,
    awayTeamProviderId: Number(match.team_B_id),
    awayTeamName: match.team_B_name,
    homeGoals: parseScore(match.fs_A),
    awayGoals: parseScore(match.fs_B),
  };
}

/** Every match TASO has for the season, regardless of group or status. */
export async function getSeasonMatches(competitionId: string): Promise<NormalizedTasoMatch[]> {
  const response = await request<MatchesResponse>(
    `/getMatches?competition_id=${competitionId}&category_id=${CATEGORY_ID}`
  );
  return (response.matches ?? []).flatMap((match) => {
    const normalized = normalizeTasoMatch(
      match,
      competitionId,
      seasonFromCompetitionId(competitionId)
    );
    return normalized ? [normalized] : [];
  });
}

/**
 * TASO's `competition_id`s encode the season as a two-digit year suffix
 * (`spljp26` → 2026, `spljp15` → 2015) — there is no separate season field
 * in the matches response to read it from.
 */
export function seasonFromCompetitionId(competitionId: string): number {
  const suffix = competitionId.slice(-2);
  const twoDigitYear = Number(suffix);
  return 2000 + twoDigitYear;
}

/**
 * The oldest season the app offers. Configured rather than discovered:
 * `getCompetitions` lists only *currently published* competitions, so it
 * can answer "what is the current season" but never "what seasons have
 * existed". Mirrors `FOOTBALL_DATA_EARLIEST_SEASON`.
 */
export const EARLIEST_TASO_SEASON = 2015;

/** The inverse of `seasonFromCompetitionId`. */
export function competitionIdFromSeason(seasonId: number): string {
  return `spljp${String(seasonId % 100).padStart(2, "0")}`;
}

// --- Competitions (season discovery) -----------------------------------

export type TasoCompetition = {
  competition_id?: string;
  competition_status?: string;
  season_id?: number | string;
};

type CompetitionsResponse = { competitions?: TasoCompetition[] };

/**
 * A `competition_id` identifies a *season of all Finnish football*, not a
 * single competition: `spljp26` contains 28 categories, among them `VL`
 * (Veikkausliiga), `M1L` (Ykkösliiga) and `MSC` (Miesten Suomen Cup),
 * which is why every other call here also passes `category_id`. So this
 * pattern is competition-agnostic — any Finnish competition added later
 * shares the same season lookup.
 *
 * The `\d{2}` is load-bearing and must not be relaxed to a prefix test.
 * `spljphhl26` (SPL Huuhkaja-Helmariliiga) is a genuinely separate
 * competition that shares the `spljp` prefix, the `published` status *and*
 * `season_id: 2026` — the exact id shape is the only thing that
 * distinguishes it. See specs/011-current-season-discovery.md.
 */
const SEASON_COMPETITION_ID = /^spljp\d{2}$/;

/**
 * The newest published Finnish football season, or `null` when TASO
 * publishes none this call can recognize. Callers decide how to fall back —
 * see `resolveCurrentTasoSeason`.
 */
export async function getCurrentSeason(): Promise<number | null> {
  const response = await request<CompetitionsResponse>("/getCompetitions");
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

// --- Groups (precomputed standings) ------------------------------------

/**
 * `getGroups`' per-team fields are a mix of native JSON numbers (points,
 * matches_played, etc.) and strings (`team_id`, `final_group_standing`) —
 * confirmed live, an inconsistency with `getMatches`' all-strings
 * convention, not a typo here.
 *
 * Every field is both optional and nullable because a knockout group like
 * Eurolopputurnaus isn't a points competition: TASO **omits** every stat
 * field except `matches_played` there rather than sending `null` for it,
 * so `=== null` alone never detects such a group. That absence is what
 * `isPlayoffGroup` keys on — see specs/010-playoff-group-match-list.md.
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

export type TasoGroup = {
  group_id?: string;
  group_name?: string;
  phase_number?: string;
  category_notice?: string;
  teams?: TasoGroupTeam[];
};

type GroupsResponse = { groups?: TasoGroup[] };

/** Every group TASO currently returns for the season, with its own precomputed standings. */
export async function getSeasonGroups(competitionId: string): Promise<TasoGroup[]> {
  const response = await request<GroupsResponse>(
    `/getGroups?competition_id=${competitionId}&category_id=${CATEGORY_ID}`
  );
  return response.groups ?? [];
}
