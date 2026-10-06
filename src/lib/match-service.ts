/**
 * Stored matches read across both providers: a match page's data, a pair's
 * head-to-head history, and the per-competition aggregates.
 *
 * decisions/019-match-page.md
 * decisions/042-head-to-head-view.md
 */

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
 * A stored match, tagged with the table it came from. The page branches on
 * `source`: the two rows are not interchangeable.
 *
 * decisions/019-match-page.md
 */
export type StoredMatch =
  | { source: "football-data"; match: FootballDataMatchRow }
  | { source: "taso"; match: TasoMatchRow };

/**
 * The head-to-head block, or why it is empty. `unavailable` is a match with a
 * placeholder team, which has no identity to look up.
 *
 * decisions/019-match-page.md
 */
export type HeadToHeadResult =
  | { status: "ok"; matches: FootballDataMatchRow[] }
  | { status: "ok"; matches: TasoMatchRow[] }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The match page's head-to-head block: the five meetings it lists, and how many
 * the pair has in all, from one read of the whole history.
 *
 * decisions/042-head-to-head-view.md
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

/**
 * The `competition_id` predicate that splits TASO's shared table by bucket.
 *
 * decisions/019-match-page.md
 */
function tasoBucketPredicate(bucket: "domestic" | "national") {
  const pattern = `${NATIONAL_TEAM_COMPETITION_PREFIX}%`;
  return bucket === "national"
    ? like(tasoMatches.competitionCode, pattern)
    : notLike(tasoMatches.competitionCode, pattern);
}

/**
 * Whether a football-data row belongs to the region whose route asked for it.
 *
 * decisions/019-match-page.md
 */
function isInRegion(row: FootballDataMatchRow, region: CompetitionRegion): boolean {
  return competitionsInRegion(region).some(
    (competition) => competition.code === row.competitionCode
  );
}

/**
 * Whether a TASO row belongs to the bucket whose route asked for it.
 *
 * decisions/019-match-page.md
 */
function isInBucket(row: TasoMatchRow, bucket: "domestic" | "national"): boolean {
  const isNational = row.competitionCode.startsWith(NATIONAL_TEAM_COMPETITION_PREFIX);
  return bucket === "national" ? isNational : !isNational;
}

/**
 * The five most recent meetings strictly before `match`, newest first, out of
 * the pair's whole history. A leg of a two-legged tie is a match here.
 *
 * decisions/019-match-page.md
 * decisions/042-head-to-head-view.md
 */
function previousOf<Row extends FootballDataMatchRow | TasoMatchRow>(
  match: Row,
  history: readonly Row[]
): Row[] {
  return history.filter((row) => row.kickoffAt < match.kickoffAt).slice(0, HEAD_TO_HEAD_LIMIT);
}

/**
 * The football-data match's previous meetings. One function per provider, each
 * called from the branch that already proved its types.
 *
 * decisions/019-match-page.md
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
 * Every stored meeting between two teams, newest first: no anchor, no limit,
 * and the match linked from included. Same scope as the match page's block.
 *
 * decisions/042-head-to-head-view.md
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
 * Whether a football-data row has a shoot-out stored, both sides. The stored
 * score includes one, and every aggregate here subtracts it, as
 * `withoutShootout` does for the tables.
 *
 * decisions/492-shootout-out-of-the-score.md
 * decisions/528-one-shootout-rule.md
 */
const SHOOTOUT_STORED = sql`(${matches.penaltiesHome} is not null and ${matches.penaltiesAway} is not null)`;
export const FOOTBALL_DATA_HOME_GOALS = sql`(${matches.homeGoals} - case when ${SHOOTOUT_STORED} then ${matches.penaltiesHome} else 0 end)`;
export const FOOTBALL_DATA_AWAY_GOALS = sql`(${matches.awayGoals} - case when ${SHOOTOUT_STORED} then ${matches.penaltiesAway} else 0 end)`;

/**
 * A competition's goals per game in each stored season, or `error`. Every
 * finished match with both scores, every stage.
 *
 * decisions/048-league-goals-per-game-trend.md
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
 * Every compared competition's home wins, draws and away wins, or `error` when
 * either provider's read fails: never a partial table.
 *
 * decisions/049-home-advantage-and-draw-rate.md
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
 * One competition's home-win baseline, or `error`: every stored finished match,
 * the season in progress included, with no season floor.
 *
 * decisions/051-home-win-baseline.md
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

/**
 * The four counts `SeasonOutcomes` needs, from a side's goals and the match's status.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 */
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
 * Each season's counts for `codes`, from `floor` on, or from the first stored
 * season when `floor` is null.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/051-home-win-baseline.md
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
  // `(competition_id, category_id)` pair for that season.
  return rows.flatMap(({ competitionId, categoryId, ...counts }) => {
    const code = competitionForSeasonPair(codes, competitionId, categoryId, counts.seasonId);
    return code === null
      ? []
      : [{ ...counts, kind: "taso" as const, code, spansCalendarYears: false }];
  });
}

/**
 * One club's finished matches with both scores stored, in its source's scope:
 * the head-to-head's predicates without the second team.
 *
 * decisions/045-bogey-teams.md
 * decisions/047-rivalry-page.md
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

/**
 * Every such match of one club, newest first.
 *
 * decisions/045-bogey-teams.md
 */
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

/**
 * The club's `FORM_WINDOW` most recent such matches, newest first.
 *
 * decisions/047-rivalry-page.md
 */
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
 * A team's current form for the head-to-head page, or `error`.
 *
 * decisions/047-rivalry-page.md
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
 * The `Vaikeimmat vastustajat` panel's series for one club. `basePath` is the
 * club's own route prefix, which the head-to-head links are built on.
 *
 * decisions/045-bogey-teams.md
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
 * Each group given with its competition's average score attached, or why there
 * is none.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export type CompetitionAverages<Group> =
  | { status: "ok"; rows: Array<Group & { competition: ScoreAverage }> }
  | { status: "error" };

/**
 * The average home and away score over every finished match with both scores in
 * exactly the competition-seasons given. An empty scope is a failure.
 *
 * decisions/044-scorelines-and-goal-averages.md
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
 * One match, its previous meetings and how many the pair has in all, or why
 * they are not there. `cache()`d per request, keyed on primitives.
 *
 * decisions/019-match-page.md
 * decisions/042-head-to-head-view.md
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

/**
 * One match page's data. An id the column cannot hold is `not_found` without a
 * query.
 *
 * decisions/019-match-page.md
 * decisions/020-context-free-team-page.md
 */
export function getMatchPageData(
  source: MatchSource,
  providerMatchId: number
): Promise<MatchPageData> {
  // An id the column cannot hold is a match that cannot exist: not found, where
  // the database would fail at bind time.
  if (!isStoredInteger(providerMatchId)) return Promise.resolve({ status: "not_found" });

  const scope = source.kind === "football-data" ? source.region : source.bucket;
  return loadMatchPageData(source.kind, scope, providerMatchId);
}
