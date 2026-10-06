/**
 * A team's league position after each round of a season. Pure, and it ranks
 * nothing itself: every table comes from a function the caller passes in.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/413-rounds-a-team-sat-out.md
 */
import { calculateStandings, type NormalizedMatch, type RosterMatch } from "./standings";

export type PositionPoint = {
  round: number;
  position: number;
  /**
   * Whether this team played a match counted in this round. `false` is a round
   * it sat out, where its position moved only because others played.
   */
  played: boolean;
};

export type PositionSeries =
  | {
      status: "ok";
      points: PositionPoint[];
      /**
       * The y-axis extent: every team the plotted positions rank. The whole league,
       * also after a split; in a league played in parallel pools, the team's pool.
       */
      teamCount: number;
      /**
       * The line stops at the end of the regular season: the continuation has no
       * per-round table to equal.
       */
      endsAtSplit: boolean;
    }
  /** This team has no finished round in the season yet. */
  | { status: "no-rounds" }
  /**
   * No per-round table exists for this team's league season, so the section is
   * not shown.
   */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Just what a round and a participant need: both providers' rows satisfy it.
 *
 * decisions/030-league-position-by-matchday.md
 */
export type PlayedMatch = {
  matchday: number | null;
  homeTeamProviderId: number;
  awayTeamProviderId: number;
};

/**
 * A table row, as both providers' ranking functions produce it.
 *
 * decisions/030-league-position-by-matchday.md
 */
export type RankedRow = { teamProviderId: number; position: number };

/**
 * The last round this team finished a match in, or `null` when it has none. A
 * match with no round counts towards none.
 *
 * decisions/030-league-position-by-matchday.md
 */
export function lastRoundPlayedBy(finished: readonly PlayedMatch[], teamId: number): number | null {
  const rounds = roundsPlayedBy(finished, teamId);
  return rounds.size === 0 ? null : Math.max(...rounds);
}

/**
 * Every round with a finished match, ascending, up to and including `last`. A
 * round this team sat out is included.
 *
 * decisions/030-league-position-by-matchday.md
 */
export function roundsToPlot(finished: readonly PlayedMatch[], last: number): number[] {
  const rounds = new Set<number>();

  for (const match of finished) {
    if (match.matchday !== null && match.matchday <= last) rounds.add(match.matchday);
  }

  return [...rounds].sort((left, right) => left - right);
}

/**
 * This team's position after each round it has reached, plus `offset`: the
 * teams in groups ranked above it after a split, 0 otherwise. Also whether it
 * played in that round. Throws when a table lacks the team.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/413-rounds-a-team-sat-out.md
 */
export function positionsAfterEachRound(
  finished: readonly PlayedMatch[],
  last: number,
  teamId: number,
  tableAfter: (round: number) => readonly RankedRow[],
  offset = 0
): PositionPoint[] {
  const played = roundsPlayedBy(finished, teamId);

  return roundsToPlot(finished, last).map((round) => {
    const row = tableAfter(round).find((candidate) => candidate.teamProviderId === teamId);
    if (row === undefined) {
      throw new Error(`Team ${teamId} is missing from the table after round ${round}`);
    }
    return { round, position: row.position + offset, played: played.has(round) };
  });
}

/**
 * The rounds in which this team finished a match. A match with no round counts towards none.
 *
 * decisions/413-rounds-a-team-sat-out.md
 */
function roundsPlayedBy(finished: readonly PlayedMatch[], teamId: number): Set<number> {
  const rounds = new Set<number>();

  for (const match of finished) {
    if (match.matchday === null) continue;
    if (match.homeTeamProviderId === teamId || match.awayTeamProviderId === teamId) {
      rounds.add(match.matchday);
    }
  }

  return rounds;
}

/**
 * One table all season: a football-data.org league. The same arguments the
 * standings page passes to `calculateStandings`.
 *
 * decisions/030-league-position-by-matchday.md
 */
export function singleTableSeries(
  finished: readonly NormalizedMatch[],
  roster: readonly RosterMatch[],
  teamId: number
): PositionSeries {
  const last = lastRoundPlayedBy(finished, teamId);
  if (last === null) return { status: "no-rounds" };

  const points = positionsAfterEachRound(finished, last, teamId, (round) =>
    calculateStandings(
      finished.filter((match) => match.matchday !== null && match.matchday <= round),
      [...roster]
    )
  );

  return {
    status: "ok",
    points,
    teamCount: calculateStandings([], [...roster]).length,
    endsAtSplit: false,
  };
}

/**
 * The number of teams in every group ranked above `own`, after a split. Groups
 * are ranked by where their teams finished the regular season.
 *
 * decisions/030-league-position-by-matchday.md
 */
export function teamsInGroupsAbove(
  own: ReadonlySet<number>,
  groups: ReadonlyArray<ReadonlySet<number>>,
  regularSeasonOrder: readonly number[]
): number {
  const rank = bestRegularSeasonPlace(own, regularSeasonOrder);

  return groups
    .filter((group) => bestRegularSeasonPlace(group, regularSeasonOrder) < rank)
    .reduce((sum, group) => sum + group.size, 0);
}

/**
 * Where a group's best team finished the regular season, as an index into it.
 * A group none of whose teams appear there ranks last.
 *
 * decisions/030-league-position-by-matchday.md
 */
function bestRegularSeasonPlace(
  teamIds: ReadonlySet<number>,
  regularSeasonOrder: readonly number[]
): number {
  const places = [...teamIds]
    .map((teamId) => regularSeasonOrder.indexOf(teamId))
    .filter((place) => place !== -1);

  return places.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...places);
}
