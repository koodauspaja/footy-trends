/**
 * A team's league position after each round of a season — the data behind the
 * team page's `Sijoitus kierroksittain` chart (specs/030).
 *
 * **Pure, and it decides no ranking of its own.** Every table comes from a
 * function the caller passes in, which is the same calculation the standings
 * page uses for that provider. So a plotted position always equals the one the
 * standings page shows for that round — the property the feature rests on —
 * and a change to how a table is ranked cannot make the two disagree.
 */
import { calculateStandings, type NormalizedMatch, type RosterMatch } from "./standings";

export type PositionPoint = { round: number; position: number };

export type PositionSeries =
  | {
      status: "ok";
      points: PositionPoint[];
      /**
       * The y-axis extent: every team the plotted positions rank — the whole
       * league, also after a split. In a league played in parallel pools, the
       * team's pool, which is the table its positions come from.
       */
      teamCount: number;
      /**
       * The line stops at the end of the regular season because the
       * continuation has no per-round table to equal — see specs/030's *Split
       * seasons*. The page says so beneath the chart.
       */
      endsAtSplit: boolean;
    }
  /** This team has no finished round in the season yet. */
  | { status: "no-rounds" }
  /**
   * No per-round table exists for this team's league season at all — the
   * standings page shows no round selector for it either — so there is
   * nothing the chart could equal, and the section is not shown.
   */
  | { status: "unavailable" }
  | { status: "error" };

/** Just what a round and a participant need — both providers' rows satisfy it. */
export type PlayedMatch = {
  matchday: number | null;
  homeTeamProviderId: number;
  awayTeamProviderId: number;
};

/** A table row, as both providers' ranking functions produce it. */
export type RankedRow = { teamProviderId: number; position: number };

/**
 * The last round this team finished a match in, or `null` when it has none.
 *
 * A match with no round counts towards none, as spec 003 has it.
 */
export function lastRoundPlayedBy(finished: readonly PlayedMatch[], teamId: number): number | null {
  let last: number | null = null;

  for (const match of finished) {
    if (match.matchday === null) continue;
    if (match.homeTeamProviderId !== teamId && match.awayTeamProviderId !== teamId) continue;
    if (last === null || match.matchday > last) last = match.matchday;
  }

  return last;
}

/**
 * Every round with a finished match, ascending, up to and including `last`.
 *
 * **A round this team sat out is included**: a bye in an odd-sized league, or a
 * match of theirs still to be played. The table moved when the others played,
 * so where it stood is still a point on the line.
 */
export function roundsToPlot(finished: readonly PlayedMatch[], last: number): number[] {
  const rounds = new Set<number>();

  for (const match of finished) {
    if (match.matchday !== null && match.matchday <= last) rounds.add(match.matchday);
  }

  return [...rounds].sort((left, right) => left - right);
}

/**
 * This team's position in the table after each round, plus `offset` — the
 * number of teams in groups ranked above it after a split, 0 otherwise.
 *
 * The row's own `position` is used rather than its index, so the chart shows
 * exactly the number the standings page displays, whatever rule produced it.
 *
 * **Throws when a table does not contain the team**, rather than returning
 * something a caller must check. Both callers' tables include every team that
 * has a match in the season — `calculateStandings` adds each match's
 * participants to the roster it is given — so the state is unreachable, and a
 * branch for it in each caller would be a condition no test could take. A
 * missing team must still never become a plausible position: the services
 * catch the throw and report an error.
 */
export function positionsAfterEachRound(
  rounds: readonly number[],
  teamId: number,
  tableAfter: (round: number) => readonly RankedRow[],
  offset = 0
): PositionPoint[] {
  return rounds.map((round) => {
    const row = tableAfter(round).find((candidate) => candidate.teamProviderId === teamId);
    if (row === undefined) {
      throw new Error(`Team ${teamId} is missing from the table after round ${round}`);
    }
    return { round, position: row.position + offset };
  });
}

/**
 * One table all season — a football-data.org league.
 *
 * The same arguments `getStandings({ round })` passes to `calculateStandings`:
 * finished matches up to the round, and the whole season as the roster, so a
 * team that has not played yet is still in the table at the position the
 * standings page gives it.
 */
export function singleTableSeries(
  finished: readonly NormalizedMatch[],
  roster: readonly RosterMatch[],
  teamId: number
): PositionSeries {
  const last = lastRoundPlayedBy(finished, teamId);
  if (last === null) return { status: "no-rounds" };

  const points = positionsAfterEachRound(roundsToPlot(finished, last), teamId, (round) =>
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
 * The number of teams in every group ranked above `own`, after a split.
 *
 * **Groups are ranked by where their teams finished the regular season**: the
 * group holding the best-placed team is the upper one. Not by group id or group
 * name, neither of which records the order — so the lower group's leader is 7th
 * when the upper group has six teams, whatever the ids say (specs/030, B).
 *
 * Group sizes come from the data: six is Veikkausliiga's current shape, not a
 * constant.
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
