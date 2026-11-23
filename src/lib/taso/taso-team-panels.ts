/**
 * A club's TASO seasons as the team page reads them: its position series, result
 * panels, season comparison, streak records and summary.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/816-split-by-job.md
 */

import { logger } from "../platform/logger";
import {
  lastRoundPlayedBy,
  type PositionPoint,
  type PositionSeries,
  positionsAfterEachRound,
} from "../teams/position-series";
import {
  comparisonFor,
  RANKED_MEASURES,
  type SeasonComparisonSeries,
  type SeasonReadResult,
  UNRANKED_MEASURES,
} from "../teams/season-comparison";
import { teamSeasonSummary } from "../teams/season-summary-service";
import { competitionScope, recordsFor, type StreakRecordsSeries } from "../teams/streak-records";
import type { TeamPanelMatches } from "../teams/team-panels";
import type { TeamSeason } from "../teams/team-seasons";
import {
  categoryIdForSeason,
  competitionIdForSeason,
  DOMESTIC_COMPETITIONS,
  getDomesticCompetitionName,
  isDomesticCup,
} from "./domestic-competitions";
import { classifySeasonGroups } from "./taso-standings-service";
import {
  type FinishedMatchRow,
  type GroupStandingsResult,
  groupTeamsFor,
  isCupCategory,
  leaguePath,
  type MatchRow,
  ownCalculatedStandings,
  type StoredGroupTeam,
  type TableAfter,
  teamIdsInGroup,
  toFinishedMatches,
} from "./taso-tables";

/**
 * This team's league position after each round of a season. Every table is
 * `ownCalculatedStandings`, so a plotted position equals the standings page's.
 *
 * decisions/030-league-position-by-matchday.md
 */
export async function getTeamPositionSeries(
  categoryId: string,
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<PositionSeries> {
  try {
    const classified = await classifySeasonGroups(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (classified.status !== "ok") {
      return classified.status === "error" ? { status: "error" } : { status: "no-rounds" };
    }

    return positionSeriesFrom(
      classified.matches,
      classified.groups,
      classified.teamRows,
      categoryId,
      competitionId,
      teamProviderId
    );
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId, teamProviderId },
      "Unable to compute the TASO league position series"
    );
    return { status: "error" };
  }
}

/**
 * The finished matches this team's result panels count in a season, as
 * `teamPanelMatches` selects them. Nothing stored is an empty list; `unavailable`
 * is a team that played only in match lists.
 *
 * decisions/031-rolling-form-trend.md
 * decisions/040-cup-analytics.md
 * decisions/530-one-team-panel-builder.md
 */
export async function getTeamPanelMatches(
  categoryId: string,
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<TeamPanelMatches> {
  try {
    const league = await teamPanelMatches(
      categoryId,
      competitionId,
      teamProviderId,
      seasonId,
      activeSeasonId
    );
    return league.status === "no-matches" ? { status: "ok", finished: [] } : league;
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId, teamProviderId },
      "Unable to read the matches a TASO team's panels count"
    );
    return { status: "error" };
  }
}

/**
 * The selected season against the club's others, as `seasonsBeside` picks them;
 * a cup is measured without the ranked measures. The reads are the cached
 * classification's, and stale rows are served.
 *
 * decisions/038-season-against-history.md
 * decisions/040-cup-analytics.md
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
      (key) => readTasoSeason(key.competitionCode, key.seasonId, activeSeasonId, teamProviderId),
      isDomesticCup(competitionCode) ? UNRANKED_MEASURES : RANKED_MEASURES
    );
  } catch (error) {
    logger.error(
      { err: error, competitionCode, seasonId, teamProviderId },
      "Unable to compare the TASO season with the club's others"
    );
    return { status: "error" };
  }
}

/**
 * One TASO season as `compareSeasons` needs it: the club's matches as every
 * other panel counts them, and the season's whole fixture list.
 *
 * decisions/038-season-against-history.md
 * decisions/040-cup-analytics.md
 */
async function readTasoSeason(
  competitionCode: string,
  seasonId: number,
  activeSeasonId: number,
  teamProviderId: number
): Promise<SeasonReadResult> {
  const categoryId = categoryIdForSeason(competitionCode, seasonId);
  // The registry's id, not the umbrella's: a cup published as its own
  // competition (`Liigacup26`, `M1LCUP26`) has nothing under `spljp26`.
  const competitionId = competitionIdForSeason(competitionCode, seasonId);

  // Classified first, so a season this app holds nothing for is `null` here
  // rather than a branch further down that no test could take. The second call
  // below reads the same cached classification.
  const classified = await classifySeasonGroups(
    categoryId,
    competitionId,
    seasonId,
    activeSeasonId
  );
  if (classified.status !== "ok") {
    return classified.status === "error" ? { status: "error" } : { status: "empty" };
  }

  const league = await teamPanelMatches(
    categoryId,
    competitionId,
    teamProviderId,
    seasonId,
    activeSeasonId
  );
  // Not an error: a season this club has no counted match in is empty.
  if (league.status !== "ok") return { status: "empty" };

  // A pass-through season stays: its matches are league matches, and only its
  // published table disagrees with ours, so it ranks nobody. Its position is
  // null and its results count towards every rate.
  const series = positionSeriesFrom(
    classified.matches,
    classified.groups,
    classified.teamRows,
    categoryId,
    competitionId,
    teamProviderId
  );

  return {
    status: "ok",
    read: {
      competition: getDomesticCompetitionName(competitionCode),
      finished: league.finished,
      all: classified.matches,
      points: series.status === "ok" ? series.points : [],
      teamCount: series.status === "ok" ? series.teamCount : 0,
    },
  };
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
    (key) => readTasoSeason(key.competitionCode, key.seasonId, activeSeasonId, teamProviderId),
    competitionScope
  ).catch((error) => {
    logger.error({ err: error, teamProviderId }, "Unable to read the club's TASO streak records");
    return { status: "error" as const };
  });
}

/**
 * The `Kausi lyhyesti` block for this club's season.
 *
 * decisions/066-season-summary.md
 */
export const getTeamSeasonSummary = teamSeasonSummary("taso", {
  isLeague: isDomesticLeague,
  read: (key, activeSeasonId, teamProviderId) =>
    readTasoSeason(key.competitionCode, key.seasonId, activeSeasonId, teamProviderId),
});

/**
 * Which of the club's seasons belong beside this one: the league ones for a
 * league page, that cup's own for a cup page.
 *
 * decisions/040-cup-analytics.md
 */
function seasonsBeside(competitionCode: string): (code: string) => boolean {
  return isDomesticCup(competitionCode) ? (code) => code === competitionCode : isDomesticLeague;
}

/**
 * A domestic competition the registry knows to be a league: `isDomesticCup` is
 * `false` for an unknown code, and stored rows can outlive their registry entry.
 *
 * decisions/038-season-against-history.md
 */
function isDomesticLeague(competitionCode: string): boolean {
  return (
    DOMESTIC_COMPETITIONS.some((competition) => competition.code === competitionCode) &&
    !isDomesticCup(competitionCode)
  );
}

/**
 * A cup's matches for this team: every group, because a cup has no table.
 *
 * decisions/040-cup-analytics.md
 */
async function teamCupMatches(
  categoryId: string,
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<
  | { status: "ok"; finished: FinishedMatchRow[] }
  | { status: "no-matches" }
  | { status: "unavailable" }
  | { status: "error" }
> {
  const classified = await classifySeasonGroups(
    categoryId,
    competitionId,
    seasonId,
    activeSeasonId
  );
  if (classified.status !== "ok") {
    return classified.status === "error" ? { status: "error" } : { status: "no-matches" };
  }

  const cupMatches = classified.matches.filter(
    (match) =>
      match.homeTeamProviderId === teamProviderId || match.awayTeamProviderId === teamProviderId
  );
  if (cupMatches.length === 0) return { status: "unavailable" };

  return { status: "ok", finished: toFinishedMatches(cupMatches) };
}

/**
 * The matches a panel counts for this team and season, by the competition's
 * shape: a league's table groups, or a cup's every group.
 *
 * decisions/040-cup-analytics.md
 */
function teamPanelMatches(
  categoryId: string,
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
) {
  const select = isCupCategory(categoryId) ? teamCupMatches : teamLeagueMatches;
  return select(categoryId, competitionId, teamProviderId, seasonId, activeSeasonId);
}

/**
 * This team's finished matches in the season's table groups, own-calculated or
 * pass-through, as every result chart counts them. `unavailable` when the team
 * played only in match lists; `no-matches` when nothing is stored.
 *
 * decisions/031-rolling-form-trend.md
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/040-cup-analytics.md
 */
async function teamLeagueMatches(
  categoryId: string,
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<
  | { status: "ok"; finished: FinishedMatchRow[] }
  | { status: "no-matches" }
  | { status: "unavailable" }
  | { status: "error" }
> {
  const classified = await classifySeasonGroups(
    categoryId,
    competitionId,
    seasonId,
    activeSeasonId
  );
  if (classified.status !== "ok") {
    return classified.status === "error" ? { status: "error" } : { status: "no-matches" };
  }

  const tableGroupIds = new Set(
    classified.groups.filter((group) => group.kind !== "match-list").map((group) => group.groupId)
  );
  // This team's matches in the groups that keep a table.
  const leagueMatches = classified.matches.filter(
    (match) =>
      tableGroupIds.has(match.groupId) &&
      (match.homeTeamProviderId === teamProviderId || match.awayTeamProviderId === teamProviderId)
  );
  if (leagueMatches.length === 0) return { status: "unavailable" };

  return { status: "ok", finished: toFinishedMatches(leagueMatches) };
}

/**
 * The position series from a classified season: a round is plotted only where
 * the standings page has a table for it.
 *
 * decisions/030-league-position-by-matchday.md
 */
function positionSeriesFrom(
  seasonMatches: MatchRow[],
  groups: ReadonlyArray<Pick<GroupStandingsResult, "kind" | "groupId">>,
  teamRows: StoredGroupTeam[],
  categoryId: string,
  competitionId: string,
  teamId: number
): PositionSeries {
  const tableAfter: TableAfter = (groupId) => (round) =>
    ownCalculatedStandings(
      seasonMatches,
      groupTeamsFor(teamRows, groupId),
      categoryId,
      competitionId,
      groupId,
      round
    );
  const path = leaguePath(
    seasonMatches,
    groups.filter((group) => group.kind !== "match-list"),
    categoryId,
    competitionId,
    teamId,
    tableAfter
  );
  if (path === null) return { status: "unavailable" };
  const { regular } = path;

  // "Finished" as the standings page defines it, one group at a time.
  const finishedIn = (groupId: number) =>
    toFinishedMatches(seasonMatches.filter((match) => match.groupId === groupId));

  const regularFinished = finishedIn(regular.groupId);
  const lastRegular = lastRoundPlayedBy(regularFinished, teamId);
  if (lastRegular === null) return { status: "no-rounds" };

  const regularPoints = positionsAfterEachRound(
    regularFinished,
    lastRegular,
    teamId,
    tableAfter(regular.groupId)
  );
  const teamCount = teamIdsInGroup(seasonMatches, regular.groupId).size;

  if (path.continuation === undefined) return seriesOf(regularPoints, teamCount, false);
  if (!path.combinable) return seriesOf(regularPoints, teamCount, true);

  const continuationFinished = finishedIn(path.continuation.groupId);
  const lastContinuation = lastRoundPlayedBy(continuationFinished, teamId);

  if (lastContinuation === null) {
    // True when the continuation was played only in matches with no round, where
    // the line stops with a note. Not when it has simply not been played yet.
    const playedWithoutRound = continuationFinished.some(
      (match) => match.homeTeamProviderId === teamId || match.awayTeamProviderId === teamId
    );
    return seriesOf(regularPoints, teamCount, playedWithoutRound);
  }

  const continuationPoints = positionsAfterEachRound(
    continuationFinished,
    lastContinuation,
    teamId,
    tableAfter(path.continuation.groupId),
    path.offset
  );

  return seriesOf([...regularPoints, ...continuationPoints], teamCount, false);
}

function seriesOf(
  points: PositionPoint[],
  teamCount: number,
  endsAtSplit: boolean
): PositionSeries {
  return { status: "ok", points, teamCount, endsAtSplit };
}
