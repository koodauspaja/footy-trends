import { and, desc, eq, gte, inArray, isNotNull, like, notLike, or, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { type CompetitionRegion, competitionsInRegion } from "./competitions";
import {
  categoryIdForSeason,
  categoryIdsFor,
  competitionForSeasonPair,
  competitionIdForSeason,
} from "./domestic-competitions";
import { FORM_WINDOW, type LatestForm, latestForm } from "./form-series";
import {
  COMPETITIONS,
  type GoalsPerGameSeries,
  goalsPerGameSeries,
  type SeasonGoals,
} from "./goals-per-game";
import {
  type CompetitionScope,
  HEAD_TO_HEAD_LIMIT,
  headToHeadWindow,
  headToHeadWindowSentence,
  meetingsHref,
  type OpponentsSeries,
  type ScoreAverage,
  spansCalendarYears,
  worstOpponents,
} from "./head-to-head";
import { type HomeBaseline, homeBaseline } from "./home-baseline";
import { logger } from "./logger";
import { hasPlaceholderTeam } from "./match-detail";
import { type MatchSource, NATIONAL_TEAM_COMPETITION_PREFIX } from "./match-source";
import {
  LEFT_TO_PLAY,
  type OutcomeShares,
  outcomeShares,
  type SeasonOutcomes,
} from "./outcome-shares";
import { isStoredInteger } from "./provider-ids";
import { resolveEarliestSeason } from "./seasons";
import { toFinishedMatches } from "./standings";

export type FootballDataMatchRow = typeof matches.$inferSelect;
export type TasoMatchRow = typeof tasoMatches.$inferSelect;

/**
 * A stored match, tagged with the table it came from.
 *
 * The two rows are not interchangeable — one carries a score breakdown and a
 * stage, the other a series name and TASO's own verdict on who went through —
 * so the page branches on `source` rather than flattening them into a shape
 * that would have to lie about one of them.
 */
export type StoredMatch =
  | { source: "football-data"; match: FootballDataMatchRow }
  | { source: "taso"; match: TasoMatchRow };

/**
 * Why the head-to-head block is empty, when it is.
 *
 * `unavailable` is not an error: it is a match with a placeholder team, where
 * there is no identity to look up. Telling the reader that is honest;
 * showing an empty list would claim these teams have never met.
 */
export type HeadToHeadResult =
  | { status: "ok"; matches: FootballDataMatchRow[] }
  | { status: "ok"; matches: TasoMatchRow[] }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The match page's head-to-head block: the five meetings it lists, and how many
 * the pair has in all — the number its link to the full history carries
 * (specs/042, S10).
 *
 * Both come from one read of the whole history, so `total` is the row count of
 * the page the link leads to rather than a second query able to disagree with
 * it, and a match page costs one head-to-head query, not two.
 */
export type PreviousMeetings =
  | { status: "ok"; matches: FootballDataMatchRow[]; total: number }
  | { status: "ok"; matches: TasoMatchRow[]; total: number }
  | { status: "unavailable" }
  | { status: "error" };

export type MatchPageData =
  | { status: "not_found" }
  | { status: "error" }
  | { status: "ok"; match: StoredMatch; headToHead: PreviousMeetings };

/** The `competition_id` predicate that splits TASO's shared table by bucket. */
function tasoBucketPredicate(bucket: "domestic" | "national") {
  const pattern = `${NATIONAL_TEAM_COMPETITION_PREFIX}%`;
  return bucket === "national"
    ? like(tasoMatches.competitionCode, pattern)
    : notLike(tasoMatches.competitionCode, pattern);
}

/** Whether a football-data row belongs to the region whose route asked for it. */
function isInRegion(row: FootballDataMatchRow, region: CompetitionRegion): boolean {
  return competitionsInRegion(region).some(
    (competition) => competition.code === row.competitionCode
  );
}

/** Whether a TASO row belongs to the bucket whose route asked for it. */
function isInBucket(row: TasoMatchRow, bucket: "domestic" | "national"): boolean {
  const isNational = row.competitionCode.startsWith(NATIONAL_TEAM_COMPETITION_PREFIX);
  return bucket === "national" ? isNational : !isNational;
}

/**
 * The five most recent meetings before `match`, newest first, out of the pair's
 * whole history.
 *
 * Every clause is a decision, set out in specs/019-match-page.md: both
 * orientations, strictly earlier than this match, played matches only, and
 * scoped to the same source so a Kotimaa page cannot surface a Huuhkajat row
 * out of the table they share. The history already applies all but "strictly
 * earlier", and a row cannot kick off strictly before itself, so that one
 * clause also keeps the match off its own list. The history's ordering is
 * total — two meetings can share a kickoff instant, and a page that reordered
 * between renders would be a bug nobody could reproduce — and filtering keeps it.
 *
 * A leg of a two-legged tie is a match here, with its own row and its own
 * score. Ties belong to the bracket; this is a list of matches.
 */
function previousOf<Row extends FootballDataMatchRow | TasoMatchRow>(
  match: Row,
  history: readonly Row[]
): Row[] {
  return history.filter((row) => row.kickoffAt < match.kickoffAt).slice(0, HEAD_TO_HEAD_LIMIT);
}

/**
 * Two functions rather than one taking both providers: a single one had to
 * re-check that the row and the route agreed about the source, which the caller
 * already knows by construction — and that check was an unreachable branch
 * pretending to be error handling. Each is called from the branch that already
 * proved its own types.
 */
async function footballDataHeadToHead(
  region: CompetitionRegion,
  match: FootballDataMatchRow
): Promise<PreviousMeetings> {
  if (hasPlaceholderTeam(match)) return { status: "unavailable" };
  const history = await footballDataHistory(
    region,
    match.homeTeamProviderId,
    match.awayTeamProviderId
  );
  return { status: "ok", matches: previousOf(match, history), total: history.length };
}

async function tasoHeadToHead(
  bucket: "domestic" | "national",
  match: TasoMatchRow
): Promise<PreviousMeetings> {
  if (hasPlaceholderTeam(match)) return { status: "unavailable" };
  const history = await tasoHistory(bucket, match.homeTeamProviderId, match.awayTeamProviderId);
  return { status: "ok", matches: previousOf(match, history), total: history.length };
}

/**
 * Every stored meeting between two teams, newest first — the whole history
 * behind specs/042, rather than the five a match page shows.
 *
 * Three things differ from the block on the match page, and each is a decision
 * rather than an omission:
 *
 * - **no anchor** (S4). The match page takes only meetings before its own
 *   kickoff, because it is context for that fixture; a history of the pair is
 *   not about one fixture, so a meeting played since belongs in it;
 * - **no limit** (S5). `HEAD_TO_HEAD_LIMIT` is a choice about the match page;
 * - **no exclusion** of the match linked from, which is one of the meetings.
 *
 * What is *not* different is the competition scope (S2) or which matches count
 * (S3): every competition in the region, finished, both scores stored. A
 * fixture still to come is returned by neither read, so nothing on that page
 * can describe a match that has not been played.
 */
export const getHeadToHeadHistory = cache(
  async (source: MatchSource, first: number, second: number): Promise<HeadToHeadResult> => {
    // A team has no history against itself, and asking would return every
    // meeting it ever hosted against itself: none, but by accident.
    if (first === second) return { status: "unavailable" };

    try {
      return source.kind === "taso"
        ? { status: "ok", matches: await tasoHistory(source.bucket, first, second) }
        : { status: "ok", matches: await footballDataHistory(source.region, first, second) };
    } catch (error) {
      logger.error({ err: error, first, second }, "Unable to read the head-to-head history");
      return { status: "error" };
    }
  }
);

async function footballDataHistory(
  region: CompetitionRegion,
  first: number,
  second: number
): Promise<FootballDataMatchRow[]> {
  const codes = competitionsInRegion(region).map((competition) => competition.code);

  return db
    .select()
    .from(matches)
    .where(
      and(
        or(
          and(eq(matches.homeTeamProviderId, first), eq(matches.awayTeamProviderId, second)),
          and(eq(matches.homeTeamProviderId, second), eq(matches.awayTeamProviderId, first))
        ),
        eq(matches.status, FINISHED_STATUS),
        isNotNull(matches.homeGoals),
        isNotNull(matches.awayGoals),
        inArray(matches.competitionCode, codes)
      )
    )
    .orderBy(desc(matches.kickoffAt), desc(matches.providerMatchId));
}

async function tasoHistory(
  bucket: "domestic" | "national",
  first: number,
  second: number
): Promise<TasoMatchRow[]> {
  return db
    .select()
    .from(tasoMatches)
    .where(
      and(
        or(
          and(
            eq(tasoMatches.homeTeamProviderId, first),
            eq(tasoMatches.awayTeamProviderId, second)
          ),
          and(eq(tasoMatches.homeTeamProviderId, second), eq(tasoMatches.awayTeamProviderId, first))
        ),
        eq(tasoMatches.status, FINISHED_STATUS),
        isNotNull(tasoMatches.homeGoals),
        isNotNull(tasoMatches.awayGoals),
        tasoBucketPredicate(bucket)
      )
    )
    .orderBy(desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId));
}

const FINISHED_STATUS = "FINISHED";

/**
 * A football-data match's goals after extra time, each side's.
 *
 * The stored score is the provider's `fullTime`, which **includes** a penalty
 * shoot-out: Liverpool "1–5" PSG (Champions League, 2024/25) was 0–1 with
 * penalties 1–4. A shoot-out is neither goals (specs/044, specs/048) nor the
 * result (specs/049, S3), so every aggregate here subtracts it where stored.
 * TASO's score never includes one. See #492.
 */
const FOOTBALL_DATA_HOME_GOALS = sql`(${matches.homeGoals} - coalesce(${matches.penaltiesHome}, 0))`;
const FOOTBALL_DATA_AWAY_GOALS = sql`(${matches.awayGoals} - coalesce(${matches.penaltiesAway}, 0))`;

/**
 * A competition's goals per game in each stored season, for its standings page
 * (specs/048), or `error` — a failed read is its own case, never "too few".
 *
 * One aggregate per competition: every finished match with both scores, every
 * stage (S1, S6). A TASO competition is read over every category id the
 * registry has published it under, and each season keeps only the
 * `(competition_id, category_id)` pair the registry names for it — so a
 * competition renamed or re-coded between seasons is one line (S2), and a
 * category reused by another competition in another season is not counted.
 */
export async function getGoalsPerGame(
  kind: MatchSource["kind"],
  code: string,
  activeSeasonId: number
): Promise<GoalsPerGameSeries> {
  try {
    const seasons =
      kind === "football-data" ? await footballDataSeasonGoals(code) : await tasoSeasonGoals(code);
    return goalsPerGameSeries(seasons, activeSeasonId);
  } catch (error) {
    logger.error({ err: error, code }, "Unable to read the competition's goals per game");
    return { status: "error" };
  }
}

async function footballDataSeasonGoals(code: string): Promise<SeasonGoals[]> {
  return db
    .select({
      seasonId: matches.seasonId,
      matches: sql<number>`count(*)::int`,
      goals: sql<number>`sum(${FOOTBALL_DATA_HOME_GOALS} + ${FOOTBALL_DATA_AWAY_GOALS})::int`,
    })
    .from(matches)
    .where(
      and(
        eq(matches.competitionCode, code),
        eq(matches.status, FINISHED_STATUS),
        isNotNull(matches.homeGoals),
        isNotNull(matches.awayGoals)
      )
    )
    .groupBy(matches.seasonId);
}

async function tasoSeasonGoals(code: string): Promise<SeasonGoals[]> {
  const rows = await db
    .select({
      seasonId: tasoMatches.seasonId,
      competitionId: tasoMatches.competitionCode,
      categoryId: tasoMatches.categoryId,
      matches: sql<number>`count(*)::int`,
      goals: sql<number>`sum(${tasoMatches.homeGoals} + ${tasoMatches.awayGoals})::int`,
    })
    .from(tasoMatches)
    .where(
      and(
        inArray(tasoMatches.categoryId, categoryIdsFor(code)),
        eq(tasoMatches.status, FINISHED_STATUS),
        isNotNull(tasoMatches.homeGoals),
        isNotNull(tasoMatches.awayGoals)
      )
    )
    .groupBy(tasoMatches.seasonId, tasoMatches.competitionCode, tasoMatches.categoryId);

  return rows
    .filter(
      (row) =>
        row.competitionId === competitionIdForSeason(code, row.seasonId) &&
        row.categoryId === categoryIdForSeason(code, row.seasonId)
    )
    .map(({ seasonId, matches: count, goals }) => ({ seasonId, matches: count, goals }));
}

/**
 * Every compared competition's home wins, draws and away wins (specs/049), or
 * `error` when either provider's read fails — never a partial table, which
 * could rank a competition against only some of the others (S15).
 *
 * One aggregate per provider over the competitions specs/048 S5 names, from
 * the football-data plan floor on (S8). Which seasons are completed is decided
 * from the same rows (S19), so no provider is asked for a current season.
 */
export async function getOutcomeShares(): Promise<OutcomeShares> {
  const floor = resolveEarliestSeason(process.env.FOOTBALL_DATA_EARLIEST_SEASON);
  try {
    const [footballData, taso] = await Promise.all([
      footballDataSeasonOutcomes([...COMPETITIONS["football-data"]], floor),
      tasoSeasonOutcomes([...COMPETITIONS.taso], floor),
    ]);
    return outcomeShares([...footballData, ...taso], floor);
  } catch (error) {
    logger.error({ err: error }, "Unable to read the competitions' home advantage");
    return { status: "error" };
  }
}

/**
 * One competition's home-win baseline (specs/051), or `error` when the read
 * fails — never `empty`, which says the competition has no finished match.
 *
 * specs/049's per-season counts for this one competition, with **no season
 * floor and no completed-season filter** (S2): every stored finished match,
 * the season in progress's included. Its unplayed matches count nowhere, since
 * only finished matches with both scores are counted.
 */
export async function getHomeBaseline(
  kind: MatchSource["kind"],
  code: string
): Promise<HomeBaseline> {
  try {
    const seasons =
      kind === "football-data"
        ? await footballDataSeasonOutcomes([code], null)
        : await tasoSeasonOutcomes([code], null);
    return homeBaseline(seasons);
  } catch (error) {
    logger.error({ err: error, kind, code }, "Unable to read the home-win baseline");
    return { status: "error" };
  }
}

/** The four counts `SeasonOutcomes` needs, from a side's goals and the match's status. */
function outcomeCounts(
  status: typeof matches.status | typeof tasoMatches.status,
  home: ReturnType<typeof sql>,
  away: ReturnType<typeof sql>
) {
  const finished = sql`${status} = ${FINISHED_STATUS} and ${home} is not null and ${away} is not null`;
  return {
    matches: sql<number>`count(*) filter (where ${finished})::int`,
    homeWins: sql<number>`count(*) filter (where ${finished} and ${home} > ${away})::int`,
    draws: sql<number>`count(*) filter (where ${finished} and ${home} = ${away})::int`,
    awayWins: sql<number>`count(*) filter (where ${finished} and ${home} < ${away})::int`,
    leftToPlay: sql<number>`count(*) filter (where ${inArray(status, [...LEFT_TO_PLAY])})::int`,
  };
}

/**
 * Each season's counts for `codes`, from `floor` on — or from the first stored
 * season when `floor` is null (specs/051, S2).
 */
async function footballDataSeasonOutcomes(
  codes: string[],
  floor: number | null
): Promise<SeasonOutcomes[]> {
  const home = FOOTBALL_DATA_HOME_GOALS;
  const away = FOOTBALL_DATA_AWAY_GOALS;
  const rows = await db
    .select({
      code: matches.competitionCode,
      seasonId: matches.seasonId,
      ...outcomeCounts(matches.status, home, away),
      // A `2024/25` season has matches in the year after its own.
      spansCalendarYears: sql<boolean>`bool_or(extract(year from ${matches.kickoffAt}) > ${matches.seasonId})`,
    })
    .from(matches)
    .where(
      and(
        inArray(matches.competitionCode, codes),
        floor === null ? undefined : gte(matches.seasonId, floor)
      )
    )
    .groupBy(matches.competitionCode, matches.seasonId);
  return rows.map((row) => ({ ...row, kind: "football-data" }));
}

async function tasoSeasonOutcomes(
  codes: string[],
  floor: number | null
): Promise<SeasonOutcomes[]> {
  const home = sql`${tasoMatches.homeGoals}`;
  const away = sql`${tasoMatches.awayGoals}`;
  const rows = await db
    .select({
      seasonId: tasoMatches.seasonId,
      competitionId: tasoMatches.competitionCode,
      categoryId: tasoMatches.categoryId,
      ...outcomeCounts(tasoMatches.status, home, away),
    })
    .from(tasoMatches)
    .where(
      and(
        inArray(tasoMatches.categoryId, codes.flatMap(categoryIdsFor)),
        floor === null ? undefined : gte(tasoMatches.seasonId, floor)
      )
    )
    .groupBy(tasoMatches.seasonId, tasoMatches.competitionCode, tasoMatches.categoryId);

  // Each row belongs to the competition whose registry names its exact
  // `(competition_id, category_id)` pair for that season, as specs/048 reads.
  return rows.flatMap(({ competitionId, categoryId, ...counts }) => {
    const code = competitionForSeasonPair(codes, competitionId, categoryId, counts.seasonId);
    return code === null
      ? []
      : [{ ...counts, kind: "taso" as const, code, spansCalendarYears: false }];
  });
}

/**
 * One club's finished matches with both scores stored, in its source's scope —
 * `footballDataHistory` and `tasoHistory`'s predicates without the second team
 * (specs/045, S4). Shared by the full history and the latest five (specs/047,
 * S5), so an opponent's meetings and a team's current form count the same
 * matches.
 */
function footballDataTeamMatches(region: CompetitionRegion, team: number) {
  const codes = competitionsInRegion(region).map((competition) => competition.code);
  return and(
    or(eq(matches.homeTeamProviderId, team), eq(matches.awayTeamProviderId, team)),
    eq(matches.status, FINISHED_STATUS),
    isNotNull(matches.homeGoals),
    isNotNull(matches.awayGoals),
    inArray(matches.competitionCode, codes)
  );
}

function tasoTeamMatches(bucket: "domestic" | "national", team: number) {
  return and(
    or(eq(tasoMatches.homeTeamProviderId, team), eq(tasoMatches.awayTeamProviderId, team)),
    eq(tasoMatches.status, FINISHED_STATUS),
    isNotNull(tasoMatches.homeGoals),
    isNotNull(tasoMatches.awayGoals),
    tasoBucketPredicate(bucket)
  );
}

/** Every such match of one club, newest first (specs/045). */
async function teamHistory(
  source: MatchSource,
  team: number
): Promise<Array<FootballDataMatchRow | TasoMatchRow>> {
  return source.kind === "football-data"
    ? db
        .select()
        .from(matches)
        .where(footballDataTeamMatches(source.region, team))
        .orderBy(desc(matches.kickoffAt), desc(matches.providerMatchId))
    : db
        .select()
        .from(tasoMatches)
        .where(tasoTeamMatches(source.bucket, team))
        .orderBy(desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId));
}

/** The club's `FORM_WINDOW` most recent such matches, newest first (specs/047, S5). */
async function latestTeamMatches(
  source: MatchSource,
  team: number
): Promise<Array<FootballDataMatchRow | TasoMatchRow>> {
  return source.kind === "football-data"
    ? db
        .select()
        .from(matches)
        .where(footballDataTeamMatches(source.region, team))
        .orderBy(desc(matches.kickoffAt), desc(matches.providerMatchId))
        .limit(FORM_WINDOW)
    : db
        .select()
        .from(tasoMatches)
        .where(tasoTeamMatches(source.bucket, team))
        .orderBy(desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId))
        .limit(FORM_WINDOW);
}

/**
 * A team's current form for the head-to-head page (specs/047), or `error` —
 * a failed read is its own case, never "too few matches".
 */
export type TeamForm =
  | LatestForm<(FootballDataMatchRow | TasoMatchRow) & { homeGoals: number; awayGoals: number }>
  | { status: "error" };

export async function getTeamForm(source: MatchSource, team: number): Promise<TeamForm> {
  try {
    return latestForm(toFinishedMatches(await latestTeamMatches(source, team)), team);
  } catch (error) {
    logger.error({ err: error, team }, "Unable to read the team's latest matches");
    return { status: "error" };
  }
}

/**
 * The `Vaikeimmat vastustajat` panel's series for one club (specs/045).
 *
 * `basePath` is the club's own route prefix, which the head-to-head links are
 * built on (specs/042, S10's `meetingsLink`). National teams have no panel
 * (S5): TASO has no id stable across categories for Finland or its opponents,
 * and football-data's national teams are countries, not clubs.
 */
export async function getWorstOpponents(
  source: MatchSource,
  team: number,
  basePath: string
): Promise<OpponentsSeries> {
  const isNational =
    source.kind === "taso" ? source.bucket === "national" : source.region === "national-teams";
  if (isNational) return { status: "unavailable" };

  try {
    const history = await teamHistory(source, team);
    // `toFinishedMatches` narrows the two goal columns the query already
    // filtered on, as the head-to-head page does — a filter that removes
    // nothing here, and the type learning that it would not.
    const rows = worstOpponents(toFinishedMatches(history), team);
    return {
      status: "ok",
      rows: rows.map((row) => ({
        ...row,
        href: meetingsHref(basePath, team, row.opponentProviderId),
      })),
      windowSentence: headToHeadWindowSentence(
        headToHeadWindow(source, spansCalendarYears(source))
      ),
    };
  } catch (error) {
    logger.error({ err: error, team }, "Unable to read the club's opponents");
    return { status: "error" };
  }
}

/**
 * Each group given, with its competition's average score attached, or why
 * there is none (specs/044, S3, S7).
 *
 * The average travels on the group it belongs to rather than in a parallel
 * list, so a caller cannot pair one competition's average with another's row.
 * A failure is its own case rather than an empty list, so the page can say the
 * averages could not be computed instead of showing no competitions (S10).
 */
export type CompetitionAverages<Group> =
  | { status: "ok"; rows: Array<Group & { competition: ScoreAverage }> }
  | { status: "error" };

/**
 * The average home and away score over every finished match with both scores
 * in exactly the competition-seasons given — not the whole competition (S7).
 *
 * One aggregate per competition. The pair's own meetings are in every scope, so
 * each scope has at least one match; an empty one means the meetings and this
 * query disagree about what counts, and is reported as the failure it is rather
 * than printed as `0,0 – 0,0`.
 */
export async function getCompetitionAverages<Group extends { scope: CompetitionScope }>(
  groups: readonly Group[]
): Promise<CompetitionAverages<Group>> {
  try {
    return {
      status: "ok",
      rows: await Promise.all(
        groups.map(async (group) => ({ ...group, competition: await averageFor(group.scope) }))
      ),
    };
  } catch (error) {
    logger.error(
      { err: error, scopes: groups.map((group) => group.scope) },
      "Unable to read the competition averages"
    );
    return { status: "error" };
  }
}

async function averageFor(scope: CompetitionScope): Promise<ScoreAverage> {
  const [row] =
    scope.kind === "football-data"
      ? await db
          .select({
            home: sql<number | null>`avg(${FOOTBALL_DATA_HOME_GOALS})::float8`,
            away: sql<number | null>`avg(${FOOTBALL_DATA_AWAY_GOALS})::float8`,
          })
          .from(matches)
          .where(
            and(
              eq(matches.competitionCode, scope.competitionCode),
              inArray(matches.seasonId, scope.seasonIds),
              eq(matches.status, FINISHED_STATUS),
              isNotNull(matches.homeGoals),
              isNotNull(matches.awayGoals)
            )
          )
      : await db
          .select({
            home: sql<number | null>`avg(${tasoMatches.homeGoals})::float8`,
            away: sql<number | null>`avg(${tasoMatches.awayGoals})::float8`,
          })
          .from(tasoMatches)
          .where(
            and(
              or(
                ...scope.seasons.map((season) =>
                  and(
                    eq(tasoMatches.competitionCode, season.competitionId),
                    eq(tasoMatches.categoryId, season.categoryId)
                  )
                )
              ),
              eq(tasoMatches.status, FINISHED_STATUS),
              isNotNull(tasoMatches.homeGoals),
              isNotNull(tasoMatches.awayGoals)
            )
          );

  // `undefined` for no row at all, `null` for an aggregate over no match.
  const home = row?.home;
  const away = row?.away;
  if (home != null && away != null) return { home, away };
  throw new Error("A competition the pair met in has no finished match");
}

/**
 * One match, its previous meetings and how many meetings the pair has in all,
 * or why they are not there.
 *
 * Cached per request because Next.js calls `generateMetadata` and the page
 * separately, and both need the same two rows — the same reason
 * `getTeamMatches` is cached. Keyed on primitives rather than on the source
 * object, which a route rebuilds on every render and which would therefore
 * miss the cache every time.
 *
 * A head-to-head failure never reaches the match: the reader came for the
 * match, and the secondary block failing is not a reason to blank it.
 */
const loadMatchPageData = cache(async function loadMatchPageData(
  kind: MatchSource["kind"],
  scope: string,
  providerMatchId: number
): Promise<MatchPageData> {
  const source = (
    kind === "football-data"
      ? { kind, region: scope as CompetitionRegion }
      : { kind, bucket: scope as "domestic" | "national" }
  ) as MatchSource;

  let stored: StoredMatch;
  // Bound inside the branch that knows both the row's type and the route's, so
  // the two can never disagree.
  let headToHead: () => Promise<PreviousMeetings>;
  try {
    if (source.kind === "football-data") {
      const [row] = await db
        .select()
        .from(matches)
        .where(eq(matches.providerMatchId, providerMatchId))
        .limit(1);
      if (row === undefined || !isInRegion(row, source.region)) return { status: "not_found" };
      stored = { source: "football-data", match: row };
      headToHead = () => footballDataHeadToHead(source.region, row);
    } else {
      const [row] = await db
        .select()
        .from(tasoMatches)
        .where(eq(tasoMatches.providerMatchId, providerMatchId))
        .limit(1);
      if (row === undefined || !isInBucket(row, source.bucket)) return { status: "not_found" };
      stored = { source: "taso", match: row };
      headToHead = () => tasoHeadToHead(source.bucket, row);
    }
  } catch (error) {
    logger.error({ err: error, kind, scope, providerMatchId }, "Unable to load the match");
    return { status: "error" };
  }

  try {
    return { status: "ok", match: stored, headToHead: await headToHead() };
  } catch (error) {
    logger.error({ err: error, kind, scope, providerMatchId }, "Unable to load the head-to-head");
    return { status: "ok", match: stored, headToHead: { status: "error" } };
  }
});

export function getMatchPageData(
  source: MatchSource,
  providerMatchId: number
): Promise<MatchPageData> {
  // An id the column cannot hold is a match that cannot exist. Left to the
  // database it fails at bind time instead, and the reader is told the site
  // broke. See specs/020-context-free-team-page.md.
  if (!isStoredInteger(providerMatchId)) return Promise.resolve({ status: "not_found" });

  const scope = source.kind === "football-data" ? source.region : source.bucket;
  return loadMatchPageData(source.kind, scope, providerMatchId);
}
