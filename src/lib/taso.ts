import { getCached } from "./cache";
import { logger } from "./logger";
import { fetchProviderJson } from "./provider-request";

const API_BASE_URL = "https://spl.torneopal.net/taso/rest";

/** Mirrors football-data's match cache. Long enough to stop a page re-asking
 * the same question, short enough that a live result is not stale for long. */
const MATCHES_CACHE_TTL_SECONDS = 15 * 60;
const GROUPS_CACHE_TTL_SECONDS = 15 * 60;

/**
 * How long a page render waits for TASO before giving up on it.
 *
 * Unbounded before #363, which is how the v1.4.0 release e2e run failed 41
 * specs: TASO accepted the connection and then stalled, and with nothing
 * bounding the render the only limit that applied was Playwright's own 30 s.
 * The same commit passed twenty minutes later. Measured at the time: 47-67 ms
 * across six fresh connections, and once 19.9 s for a response whose own
 * `result_time` said 0.061 s — the server answered instantly and the transfer
 * took twenty seconds.
 *
 * Ten seconds, chosen for margin rather than derived from a measurement.
 *
 * Five was tried first and failed four national-team specs against a cold
 * cache, twice over, so the failure was real. The explanation first written
 * here was not: it blamed the page's fan-out, claiming requests spend their
 * lives queued behind each other. Measuring that fan-out refuted it — 18-20
 * requests, 12-14 of them concurrent, 0.52 MB in total, JSON parsing too cheap
 * to register, and a per-request worst case of 80-512 ms. Nothing there comes
 * within an order of magnitude of five seconds. Re-run later, five seconds
 * passed all nineteen.
 *
 * So what those runs caught was TASO being slow for an afternoon, not a
 * property of this code — the same afternoon that failed 41 specs on the
 * v1.4.0 release and answered one request in 19.9 s while reporting its own
 * `result_time` as 0.061 s.
 *
 * Ten stands because the bound is insurance against exactly those afternoons,
 * and the cost of it being loose is only how long a stalled render waits before
 * falling back. It is not a latency budget and should not be read as one.
 * Separate from football-data's bound so that tuning one does not move the
 * other.
 *
 * This bounds one attempt. `/api/health` passes its own, shorter signal, which
 * bounds the whole call on top of it — a probe and a page are different
 * questions, and the two limits stack rather than replace each other.
 */
const RENDER_TIMEOUT_MS = 10000;

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
// live: Veikkausliiga, Miesten Kakkonen and Ykkönen each have their own
// `group_id: "1"` in `spljp26`). `category_id` is required on every request —
// omitting it silently mixes in other categories' groups/matches under
// colliding group_ids — and is a parameter rather than a constant now that
// more than one category is served. See
// specs/013-more-finnish-competitions.md.

function apiKey(): string {
  const key = process.env.TASO_API_KEY;
  if (!key) throw new Error("TASO_API_KEY is not configured");
  return key;
}

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
    // Bounded here rather than at each call site: every TASO request goes
    // through this function, so one value covers the ones page renders make
    // without threading a signal through four exported functions that would
    // each have to remember to pass it. `/api/health`'s own signal still
    // bounds the whole call on top of this.
    RENDER_TIMEOUT_MS
  );
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
  /**
   * Who TASO says went through, which the score alone cannot answer for a cup:
   * a knockout tie level after normal time is decided on penalties that TASO
   * does not itemise, and it reports the outcome here instead.
   *
   * `"tie"` only ever appears in a league — verified live: `MSC` 2025 returns
   * `Home`/`Away` for all 419 matches including the 55 level ones, while `VL`
   * 2025 returns `Tie` for exactly its 40 level matches.
   */
  winner: TasoWinner;
};

/** TASO's own `winner`, lowercased. Null when the match has not been played. */
export type TasoWinner = "home" | "away" | "tie" | null;

function normalizeWinner(winner: string | undefined): TasoWinner {
  if (winner === "Home") return "home";
  if (winner === "Away") return "away";
  if (winner === "Tie") return "tie";
  return null;
}

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

/**
 * `Forfeited` is a walkover, and TASO counts it: the row carries the awarded
 * result (3-0 in every case observed) and the team's `matches_played`
 * includes it. Mapping it to anything but `FINISHED` drops it from the table
 * while TASO's own numbers still count it, which is how three P20 Ykkönen
 * groups failed to reconcile before this. 36 such matches exist across the
 * competitions spec 013 covers.
 *
 * `Planned` is a fixture whose date is not yet fixed — a scheduled match by
 * any other name, and it must not fall through as an unknown status.
 *
 * Any other status (e.g. "Live") still passes through verbatim rather than
 * crashing on the unexpected. See specs/013-more-finnish-competitions.md.
 */
function normalizeStatus(status: string): string {
  if (status === "Played" || status === "Forfeited") return "FINISHED";
  if (status === "Fixture" || status === "Planned") return "SCHEDULED";
  return status;
}

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

  /**
   * The four ids the row is stored under, all of them `integer NOT NULL`.
   * `Number` alone let `""`, `"2abc"` and an over-long digit string through as
   * 0, NaN and a rounded value — the first two fail the insert for the whole
   * season, and the third stores the match under a group or team that exists
   * but is not this one. One unusable row is worth less than the season.
   */
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
    // `""` (an unplayed match's score) and `undefined` both mean "no score
    // yet", which is what `optionalNumber` already answers for them — it read
    // the same fields the same way, so a second copy of the rule only gave the
    // scores their own version of the `Number` traps.
    homeGoals: optionalNumber(match.fs_A),
    awayGoals: optionalNumber(match.fs_B),
    winner: normalizeWinner(match.winner),
  };
}

/**
 * Every match TASO has for one category's season, regardless of group or
 * status.
 *
 * `seasonId` is passed in rather than derived from `competitionId`. The
 * derivation — an id's last two digits — is right for `spljp26` and wrong for
 * `maajp18`, which is season 2021. Deriving it here stored that bucket's rows
 * under 2018 while every read asked for 2021, so the database never answered
 * and all five of its categories refetched on each request. The caller knows
 * the season; nothing here has to guess it. See specs/017-huuhkajat.md.
 */
export async function getSeasonMatches(
  competitionId: string,
  categoryId: string,
  seasonId: number
): Promise<NormalizedTasoMatch[]> {
  // Cached like football-data's equivalent, and for a reason this provider
  // makes sharper: a bucket/category pair with no matches stores no rows, so
  // `getSyncedSeasonMatches` cannot tell "never fetched" from "fetched, and
  // there is nothing there" and refreshes on every single request. The national
  // team pages ask about every year × category combination and most are empty,
  // which made one such pair account for 18 requests in a single test run.
  const response = await getCached<MatchesResponse>(
    `taso:matches:${competitionId}:${categoryId}`,
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
 * The oldest season the app offers. Configured rather than discovered:
 * `getCompetitions` lists only *currently published* competitions, so it
 * can answer "what is the current season" but never "what seasons have
 * existed". Mirrors `FOOTBALL_DATA_EARLIEST_SEASON`.
 */
export const EARLIEST_TASO_SEASON = 2015;

/** A season's `competition_id` in the domestic `spljpNN` scheme. */
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
 * Every category in one season, as `category_id → category_name`.
 *
 * A competition's name is not stable across seasons: `NL` is "Naisten Liiga"
 * 2015-2019, "Kansallinen Liiga" 2020-2024 and "Briotech Kansallinen Liiga"
 * from 2025, and `M1` alternates between "Ykkönen" and "Miesten Ykkönen". One
 * call covers all 28 categories in a season, so a page shows the name that
 * season actually carried. See specs/013-more-finnish-competitions.md.
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
  /**
   * TASO's own classification of what the group is. `group_stage` is a first
   * round, `additional_group_stage` a continuation that carries the first
   * round's results forward, `knockout_final` a cup bracket.
   *
   * This is what lets a missing carry-over entry be *detected* rather than
   * merely regretted — see `CARRY_OVER_CONFIG` in taso-standings-service.ts.
   */
  group_type?: string;
  /**
   * The group a continuation inherits from, when TASO says. Populated for
   * recent seasons — 2026's splits point at group 1 — and `"0"` for older ones
   * (Kakkonen 2019 and Naisten SM 2015 both report 0 for groups whose parent we
   * have configured), so it is a useful hint to put in a log and not something
   * to derive the whole mapping from.
   */
  import_match_group_id?: string;
  teams?: TasoGroupTeam[];
};

/**
 * `getCategory`'s shape. The groups sit under `category`, where `getGroups`
 * returned them at the top level — see `getSeasonGroups` for why we moved.
 */
type CategoryResponse = { category?: { groups?: TasoGroup[] } };

/**
 * One `getGroups` team row, flattened and typed for storage.
 *
 * `startingPoints` is the field this whole shape exists for: TASO uses it for
 * three different things — a carry-over seed, a points deduction, and a junior
 * qualifying bonus — and standings are wrong without it. See
 * specs/013-more-finnish-competitions.md.
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
 * The range a Postgres `integer` column holds. Every numeric column these
 * normalisers feed is one, so a number outside it is not a number we can
 * store: it reaches the driver and fails the whole season's sync rather than
 * costing a single field.
 */
const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;

/**
 * One numeric field as TASO reported it, or `null` when it reported nothing
 * usable — `undefined` and `null` both mean "not reported", and a knockout
 * group omits the stat fields entirely.
 *
 * Two separate rules, because `Number` alone answers for far more than it
 * should. It reads formats TASO does not write — `"0x10"` as 16, `"1e2"` as
 * 100, `"+2"` and `" 2"` as 2, `""` as 0 — and each of those is a made-up
 * value that looks exactly like a reported one. And it reads `"2abc"` as NaN,
 * `"1e400"` as Infinity and `"2.5"` as a decimal, none of which an `integer`
 * column takes, so they would fail at the driver rather than here. So: a
 * string is a decimal integer or it is nothing, and the number it converts to
 * has to be one the column can hold.
 */
function optionalNumber(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && !/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < INT4_MIN || parsed > INT4_MAX) return null;
  return parsed;
}

/**
 * A TASO id — a match, a group, a team — or `null` when the field holds
 * something that is not one.
 *
 * Separate from `optionalNumber` because an id is a *key*. An unusable stat
 * costs one column; an unusable id costs the row its identity, and a
 * plausible-looking wrong one files real data under something else — which is
 * why the string-format rule above matters most here: `"0x10"` reported as
 * group 16 is not a rejected id, it is a real group's table with a foreign
 * team in it. Sign and zero are the rest of it: `Number("-0")` and `Number("")`
 * are zero, which `Number.isInteger` accepts and which no TASO entity has. An
 * id is a positive decimal integer the column can hold, or it is not an id.
 */
export function parseProviderId(value: number | string | null | undefined): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/**
 * Flattens `getGroups` into one row per team per group. A group with no teams
 * (TASO returns these for a qualifying match that has not been played yet)
 * contributes no rows, which is what marks it as having no table at all.
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
 * Every group TASO currently returns for one category's season, with its own
 * precomputed standings.
 *
 * **Reads `getCategory`, not `getGroups`** (#272). TASO answers `getGroups`
 * with `{"status":"error","error":"Not allowed"}` for every category and season
 * we tried, including ones whose data we already hold — while `getCategories`
 * with the same key and headers returns 200, so it is the endpoint rather than
 * the credential. Driving tulospalvelu.palloliitto.fi through a browser and
 * capturing every `taso/rest` request shows the site itself never calls
 * `getGroups`; it reads standings from `getCategory`.
 *
 * The failure was invisible because `getSyncedGroupTeams` falls back to stored
 * rows. Groups we had already synced kept rendering their last-known numbers,
 * so only a *new* group showed the problem — which is why a split round opened
 * at zero while finished seasons looked fine.
 *
 * The team rows carry the same field names either way; only the nesting
 * differs.
 */
export async function getSeasonGroups(
  competitionId: string,
  categoryId: string
): Promise<TasoGroup[]> {
  const response = await getCached<CategoryResponse>(
    `taso:category:${competitionId}:${categoryId}`,
    GROUPS_CACHE_TTL_SECONDS,
    () =>
      request<CategoryResponse>(
        `/getCategory?competition_id=${competitionId}&category_id=${categoryId}`
      )
  );
  return response.category?.groups ?? [];
}
