/**
 * A TASO group's table built from its stored rows: when TASO's own table is
 * kept, when ours is calculated, and the path a league's groups form.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/816-split-by-job.md
 */

import type { tasoGroupTeams, tasoGroupZones, tasoMatches } from "@/db/schema";
import { isRoundRobin } from "../competitions/cup-rounds";
import { calculateStandings, type TeamStanding } from "../competitions/standings";
import { teamsInGroupsAbove } from "../teams/position-series";
import { competitionCodeForCategory, cupFormatFor, isDomesticCup } from "./domestic-competitions";
import type { NormalizedTasoMatch } from "./taso";
import { type CarryOverEntry, carryOverEntry, parentGroupId } from "./taso-carry-over";

const FINISHED_STATUS = "FINISHED";

export type StoredTasoMatch = typeof tasoMatches.$inferSelect;

export type StoredGroupTeam = typeof tasoGroupTeams.$inferSelect;

export type StoredGroupZone = typeof tasoGroupZones.$inferSelect;

/**
 * A match as stored or as freshly fetched: the same shape either way.
 *
 * decisions/009-veikkausliiga.md
 */
export type MatchRow = NormalizedTasoMatch;

/**
 * A pass-through group's row: TASO's own numbers, shown when our calculation
 * does not reproduce its points. Nullable throughout, as TASO's rows are, so an
 * unreported stat renders as "–"; `form` is always empty.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 */
export type TasoTeamStanding = {
  position: number;
  teamProviderId: number;
  teamName: string;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDifference: number | null;
  points: number | null;
  form: [];
};

/**
 * How a group renders: `own-calculated` (ours, with a round selector),
 * `pass-through` (TASO's numbers, without one) or `match-list` (no table).
 *
 * decisions/009-veikkausliiga.md
 * decisions/010-playoff-group-match-list.md
 * decisions/013-more-finnish-competitions.md
 */
export type GroupStandingsResult =
  | { kind: "own-calculated"; groupId: number; groupName: string; standings: TeamStanding[] }
  | { kind: "pass-through"; groupId: number; groupName: string; standings: TasoTeamStanding[] }
  | { kind: "match-list"; groupId: number; groupName: string; matches: MatchRow[] };

/**
 * A stored match with a result, keeping the row's own type: the half-time score
 * rides on it, and the comebacks panel needs it.
 *
 * decisions/036-halftime-comebacks.md
 */
export type FinishedMatchRow = MatchRow & { homeGoals: number; awayGoals: number };

/**
 * The played matches, in the order they were given.
 *
 * decisions/009-veikkausliiga.md
 * decisions/036-halftime-comebacks.md
 */
export function toFinishedMatches(matchList: MatchRow[]): FinishedMatchRow[] {
  return matchList.filter(
    (match): match is FinishedMatchRow =>
      match.status === FINISHED_STATUS && match.homeGoals !== null && match.awayGoals !== null
  );
}

function filterByRound<T extends { matchday: number | null }>(
  matchList: T[],
  round: number | undefined
): T[] {
  if (round === undefined) return matchList;
  return matchList.filter((match) => match.matchday !== null && match.matchday <= round);
}

/**
 * A group's own round numbers, or `null` when it has none.
 *
 * decisions/133-split-group-round-numbering.md
 */
export function roundRange(
  matchList: MatchRow[],
  groupId: number
): { min: number; max: number } | null {
  const rounds = matchList
    .filter((match) => match.groupId === groupId && match.matchday !== null)
    .map((match) => match.matchday as number);
  return rounds.length === 0 ? null : { min: Math.min(...rounds), max: Math.max(...rounds) };
}

/**
 * One group's stored TASO rows.
 *
 * decisions/013-more-finnish-competitions.md
 */
export function groupTeamsFor(teamRows: StoredGroupTeam[], groupId: number): StoredGroupTeam[] {
  return teamRows.filter((row) => row.groupId === groupId);
}

/**
 * Distinct group ids present in `matchList`, regardless of status.
 *
 * decisions/009-veikkausliiga.md
 */
export function groupIdsIn(matchList: MatchRow[]): number[] {
  return [...new Set(matchList.map((match) => match.groupId))];
}

/**
 * `groupId` always comes from `groupIdsIn(matchList)`, so a match always exists.
 *
 * decisions/009-veikkausliiga.md
 */
function groupNameOf(matchList: MatchRow[], groupId: number): string {
  // biome-ignore lint/style/noNonNullAssertion: groupId is always derived from this same matchList
  return matchList.find((match) => match.groupId === groupId)!.groupName;
}

/**
 * Sorts a row TASO never ranked to the end, not the front.
 *
 * decisions/013-more-finnish-competitions.md
 */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * The position TASO published for a row: the live `current_standing`, else the
 * settled `final_group_standing`, or `null` when it published neither.
 *
 * decisions/013-more-finnish-competitions.md
 */
function publishedPosition(team: StoredGroupTeam): number | null {
  return team.currentStanding ?? team.finalGroupStanding;
}

/**
 * A stored row as a pass-through row. `position` is its place in TASO's order,
 * not TASO's literal number, which can have a gap or an unranked row.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 */
function toPassThroughStanding(team: StoredGroupTeam, index: number): TasoTeamStanding {
  return {
    position: index + 1,
    teamProviderId: team.teamProviderId,
    teamName: team.teamName,
    played: team.played,
    won: team.won,
    drawn: team.drawn,
    lost: team.lost,
    goalsFor: team.goalsFor,
    goalsAgainst: team.goalsAgainst,
    goalDifference: team.goalDifference,
    points: team.points,
    form: [],
  };
}

/**
 * One group's own matches, chronological: what a group with no table shows.
 *
 * decisions/010-playoff-group-match-list.md
 */
function selectGroupMatches(seasonMatches: MatchRow[], groupId: number): MatchRow[] {
  return seasonMatches
    .filter((match) => match.groupId === groupId)
    .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime());
}

/**
 * Every team appearing in a group's own matches: who belongs in its table.
 *
 * decisions/009-veikkausliiga.md
 */
export function teamIdsInGroup(seasonMatches: MatchRow[], groupId: number): Set<number> {
  return new Set(
    seasonMatches
      .filter((match) => match.groupId === groupId)
      .flatMap((match) => [match.homeTeamProviderId, match.awayTeamProviderId])
  );
}

/**
 * One own-calculated group's table. A carry-over group is calculated over its
 * parent's matches and its own, then filtered to its own teams and renumbered
 * from 1.
 *
 * decisions/009-veikkausliiga.md
 */
export function ownCalculatedStandings(
  seasonMatches: MatchRow[],
  /**
   * Scoped to this group already: a season-wide list would let one group's
   * `starting_points` overwrite another's, since adjustments are keyed by team.
   */
  groupTeamRows: StoredGroupTeam[],
  categoryId: string,
  competitionId: string,
  groupId: number,
  round: number | undefined
): TeamStanding[] {
  const entry = carryOverEntry(categoryId, competitionId, groupId);
  const parent = entry?.parent ?? null;
  const contributingMatches = seasonMatches.filter(
    (match) => match.groupId === groupId || (parent !== null && match.groupId === parent)
  );
  const groupTeamIds = teamIdsInGroup(seasonMatches, groupId);
  const adjustments = adjustmentsFor(seasonMatches, groupTeamRows, entry);

  return calculateStandings(
    filterByRound(toFinishedMatches(contributingMatches), round),
    contributingMatches
  )
    .filter((team) => groupTeamIds.has(team.teamProviderId))
    .map((team) => {
      const adjustment = adjustments.get(team.teamProviderId) ?? 0;
      return adjustment === 0 ? team : { ...team, points: team.points + adjustment };
    })
    .sort(byStandingOrder)
    .map((team, index) => ({ ...team, position: index + 1 }));
}

/**
 * Re-sorts a table after an adjustment has moved a team, on the keys
 * `calculateStandings` uses.
 *
 * decisions/013-more-finnish-competitions.md
 */
function byStandingOrder(left: TeamStanding, right: TeamStanding): number {
  return (
    right.points - left.points ||
    right.goalDifference - left.goalDifference ||
    right.goalsFor - left.goalsFor ||
    left.teamName.localeCompare(right.teamName)
  );
}

/**
 * How many points to add to each team's calculated total, from TASO's
 * `starting_points`: a deduction or a qualifying bonus, never a carry-over seed.
 *
 * decisions/013-more-finnish-competitions.md
 */
function adjustmentsFor(
  seasonMatches: MatchRow[],
  /** One group's rows. Keyed by team, so rows from another group would collide. */
  groupTeamRows: StoredGroupTeam[],
  entry: CarryOverEntry | null
): Map<number, number> {
  // Only a seeded entry has a parent contribution to discount; `entry` is
  // non-null inside this branch, so there is no parent to guess at.
  const parentPoints =
    entry?.seeded === true
      ? pointsFromGroup(seasonMatches, entry.parent)
      : new Map<number, number>();

  return new Map(
    groupTeamRows.map((row) => {
      const seed = parentPoints.get(row.teamProviderId) ?? 0;
      return [row.teamProviderId, (row.startingPoints ?? 0) - seed];
    })
  );
}

/**
 * Points each team earned in one group's own matches, unfiltered by round: what
 * a seeded `starting_points` encodes.
 *
 * decisions/013-more-finnish-competitions.md
 */
function pointsFromGroup(seasonMatches: MatchRow[], groupId: number): Map<number, number> {
  const groupMatches = seasonMatches.filter((match) => match.groupId === groupId);
  return new Map(
    calculateStandings(toFinishedMatches(groupMatches), groupMatches).map((team) => [
      team.teamProviderId,
      team.points,
    ])
  );
}

/**
 * Whether TASO reports the group as unplayed: points given for some team, and
 * no team with a match played or a point. TASO can serve a continuation
 * group's table so after its matches. Starting points are not asked about.
 *
 * decisions/628-zeroed-continuation-tables.md
 */
export function isUnplayedTable(
  teamRows: ReadonlyArray<Pick<StoredGroupTeam, "played" | "points">>
): boolean {
  return (
    teamRows.some((row) => row.points !== null) &&
    teamRows.every((row) => (row.played ?? 0) === 0 && (row.points ?? 0) === 0)
  );
}

/**
 * Whether an unplayed table for this group can be answered with our own: its
 * carry-over is configured, and every team has what its row is calculated
 * from, a starting point where seeded and the parent group's matches where not.
 *
 * decisions/628-zeroed-continuation-tables.md
 */
function calculableWithoutTaso(
  entry: CarryOverEntry | null,
  teamRows: StoredGroupTeam[],
  seasonMatches: MatchRow[]
): boolean {
  if (entry === null) return false;
  // A zero cannot be told from a starting point TASO has zeroed, so it counts as missing.
  if (entry.seeded) return teamRows.every((row) => (row.startingPoints ?? 0) !== 0);
  const inParent = teamIdsInGroup(seasonMatches, entry.parent);
  return teamRows.every((row) => inParent.has(row.teamProviderId));
}

/**
 * Whether TASO's stored table is only behind our results: every team it ranks
 * has a count, none above ours and one below; a team level with us has our
 * points, one behind no more. Counted over the group and its parent, as TASO does.
 *
 * decisions/644-stored-table-behind-results.md
 */
function isBehindResults(
  standings: TeamStanding[],
  teamRows: StoredGroupTeam[],
  seasonMatches: MatchRow[],
  groupId: number,
  entry: CarryOverEntry | null
): boolean {
  // A table at zero is ours only under a configured carry-over, which the
  // unplayed rule asks for and this one does not.
  if (isUnplayedTable(teamRows)) return false;

  const played = finishedMatchCounts(seasonMatches, groupId, entry?.parent ?? null);
  const points = new Map(standings.map((team) => [team.teamProviderId, team.points]));
  const rows = new Set(
    teamRows.map((row) =>
      rowAgainstOurs(row, played.get(row.teamProviderId) ?? 0, points.get(row.teamProviderId))
    )
  );
  return !rows.has("differs") && rows.has("behind");
}

/**
 * Each team's finished matches in a group and its parent.
 *
 * decisions/644-stored-table-behind-results.md
 */
function finishedMatchCounts(
  seasonMatches: MatchRow[],
  groupId: number,
  parent: number | null
): Map<number, number> {
  const played = new Map<number, number>();
  for (const match of toFinishedMatches(seasonMatches)) {
    if (match.groupId !== groupId && match.groupId !== parent) continue;
    for (const team of [match.homeTeamProviderId, match.awayTeamProviderId]) {
      played.set(team, (played.get(team) ?? 0) + 1);
    }
  }
  return played;
}

/**
 * One TASO row against ours. Fewer matches cannot have earned more points; a
 * row without points is held to its count, and alone never makes a table behind.
 *
 * decisions/644-stored-table-behind-results.md
 */
function rowAgainstOurs(
  row: StoredGroupTeam,
  ourPlayed: number,
  ourPoints: number | undefined
): "level" | "behind" | "differs" {
  if (row.played === null || row.played > ourPlayed) return "differs";
  if (row.points === null) return "level";
  if (ourPoints === undefined) return "differs";
  if (row.played === ourPlayed) return row.points === ourPoints ? "level" : "differs";
  return row.points <= ourPoints ? "behind" : "differs";
}

/**
 * Whether our calculation reproduces TASO's published points for every team it
 * ranks, over the full season. This decides how a group renders. A table ours
 * can stand in for has no points to reproduce, only its teams.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/628-zeroed-continuation-tables.md
 * decisions/644-stored-table-behind-results.md
 */
function reproducesTasoPoints(
  standings: TeamStanding[],
  teamRows: StoredGroupTeam[],
  /** TASO's table is unplayed, or behind the results, and ours can be calculated. */
  standIn: boolean
): boolean {
  // At least one row has points: `buildGroup` returns before calling this
  // when none does.
  const published = new Map(
    teamRows.flatMap((row) => (row.points === null ? [] : [[row.teamProviderId, row.points]]))
  );

  const calculated = new Set(standings.map((team) => team.teamProviderId));

  return (
    standings.every((team) => {
      const tasoPoints = published.get(team.teamProviderId);
      return standIn || tasoPoints === undefined || tasoPoints === team.points;
    }) &&
    // A table stood in for is taken on its teams alone, so on every one of them.
    (standIn ? teamRows.map((row) => row.teamProviderId) : [...published.keys()]).every(
      (teamProviderId) => calculated.has(teamProviderId)
    )
  );
}

/**
 * Whether a group keeps a table: at least one row has a real `points` number.
 * A knockout group has none; TASO omits the field, which is stored as null.
 *
 * decisions/010-playoff-group-match-list.md
 * decisions/013-more-finnish-competitions.md
 */
function keepsATable(teamRows: StoredGroupTeam[]): boolean {
  // No rows at all means TASO has no table for this group — either a knockout
  // bracket, or a qualifying match whose group exists with zero teams until it
  // is played. Three of the latter exist in 2026. Both render as matches.
  if (teamRows.length === 0) return false;
  return teamRows.some((team) => team.points !== null);
}

/**
 * Whether this TASO category belongs to a competition the registry calls a cup.
 *
 * decisions/040-cup-analytics.md
 */
export function isCupCategory(categoryId: string): boolean {
  const code = competitionCodeForCategory(categoryId);
  return code !== null && isDomesticCup(code);
}

/**
 * Whether this category's cup plays round-robin groups before its playoff, so
 * those groups keep a table. Never true for a knockout cup or a league.
 *
 * decisions/043-liigacup.md
 */
function tablesRoundRobinGroups(categoryId: string): boolean {
  const code = competitionCodeForCategory(categoryId);
  return code !== null && cupFormatFor(code) === "groups-and-playoff";
}

type TableGroup = Pick<GroupStandingsResult, "kind" | "groupId">;

/**
 * A group's own-calculated table after a round, or at the end with `undefined`.
 *
 * decisions/050-table-volatility.md
 */
export type TableAfter = (groupId: number) => (round: number | undefined) => TeamStanding[];

/**
 * Where one team's league season runs: its regular-season group, and the
 * continuation when it is a verified carry-over, with `offset` the teams ranked
 * above.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/050-table-volatility.md
 */
export type LeaguePath =
  | { regular: TableGroup; continuation: undefined }
  | { regular: TableGroup; continuation: TableGroup; combinable: false }
  | { regular: TableGroup; continuation: TableGroup; combinable: true; offset: number };

/**
 * One team's path through a classified season, or `null` when its regular
 * season has no per-round table.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/050-table-volatility.md
 */
export function leaguePath(
  seasonMatches: MatchRow[],
  tableGroups: readonly TableGroup[],
  categoryId: string,
  competitionId: string,
  teamId: number,
  tableAfter: TableAfter
): LeaguePath | null {
  // The team's table groups in the order they were played: the regular season
  // first, then its continuation.
  const teamGroups = tableGroups
    .filter((group) => teamIdsInGroup(seasonMatches, group.groupId).has(teamId))
    .sort((left, right) => firstRoundOf(seasonMatches, left) - firstRoundOf(seasonMatches, right));

  const regular = teamGroups[0];
  if (regular?.kind !== "own-calculated") return null;

  const continuation = teamGroups[1];
  if (continuation === undefined) return { regular, continuation };

  const combinable =
    continuation.kind === "own-calculated" &&
    parentGroupId(categoryId, competitionId, continuation.groupId) === regular.groupId;
  if (!combinable) return { regular, continuation, combinable: false };

  const continuationGroups = tableGroups
    .filter((group) => parentGroupId(categoryId, competitionId, group.groupId) === regular.groupId)
    .map((group) => teamIdsInGroup(seasonMatches, group.groupId));
  const regularSeasonOrder = tableAfter(regular.groupId)(undefined).map(
    (row) => row.teamProviderId
  );
  const offset = teamsInGroupsAbove(
    teamIdsInGroup(seasonMatches, continuation.groupId),
    continuationGroups,
    regularSeasonOrder
  );
  return { regular, continuation, combinable: true, offset };
}

/**
 * Where a group's rounds begin, so the regular season sorts before its continuation.
 *
 * decisions/030-league-position-by-matchday.md
 */
function firstRoundOf(seasonMatches: MatchRow[], group: { groupId: number }): number {
  return roundRange(seasonMatches, group.groupId)?.min ?? Number.POSITIVE_INFINITY;
}

/**
 * One group's rendering: a match list when it has no table, our table when it
 * reproduces TASO's points or TASO's is unplayed or behind, else TASO's numbers.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/043-liigacup.md
 * decisions/304-test-database.md
 * decisions/628-zeroed-continuation-tables.md
 * decisions/644-stored-table-behind-results.md
 */
export function buildGroup(
  seasonMatches: MatchRow[],
  allTeamRows: StoredGroupTeam[],
  categoryId: string,
  competitionId: string,
  groupId: number
): GroupStandingsResult {
  const groupName = groupNameOf(seasonMatches, groupId);
  const teamRows = groupTeamsFor(allTeamRows, groupId);

  // A cup's groups are rounds, never tables, whatever points TASO reports. The
  // exception is a round-robin group of a cup that has them.
  if (isCupCategory(categoryId)) {
    const matches = selectGroupMatches(seasonMatches, groupId);
    const isTabledGroup = tablesRoundRobinGroups(categoryId) && isRoundRobin(matches);
    if (!isTabledGroup) return { kind: "match-list", groupId, groupName, matches };
  }
  // Whether TASO's groups are known for this season *at all*. Without that
  // distinction, an unreachable `getCategory` with nothing yet stored would make
  // every group look team-less and turn the whole season into match lists.
  const seasonHasGroupData = allTeamRows.length > 0;

  if (seasonHasGroupData && !keepsATable(teamRows)) {
    return {
      kind: "match-list",
      groupId,
      groupName,
      // Chronological, like every match list. A two-legged final's aggregate row was
      // skipped at normalization.
      matches: selectGroupMatches(seasonMatches, groupId),
    };
  }

  // Always the full season: a round filter changes an own-calculated group's
  // numbers but never its classification, so `getSeasonStandings` applies one
  // afterwards rather than reclassifying per round.
  const fullSeason = ownCalculatedStandings(
    seasonMatches,
    teamRows,
    categoryId,
    competitionId,
    groupId,
    undefined
  );

  // Only a groups-and-playoff cup's round-robin group gets this far as a cup.
  const standings = isCupCategory(categoryId) ? inPublishedOrder(fullSeason, teamRows) : fullSeason;

  // Nothing to check against: own-calculated, as a real table beats an empty one.
  if (!teamRows.some((row) => row.points !== null)) {
    return {
      kind: "own-calculated",
      groupId,
      groupName,
      standings,
    };
  }

  const entry = carryOverEntry(categoryId, competitionId, groupId);
  const calculable = calculableWithoutTaso(entry, teamRows, seasonMatches);
  // A cup's table is in TASO's published order, so it is never stood in for as
  // behind; a group with no carry-over is calculated from its own matches.
  const standIn =
    (calculable && isUnplayedTable(teamRows)) ||
    (!isCupCategory(categoryId) &&
      (entry === null || calculable) &&
      isBehindResults(fullSeason, teamRows, seasonMatches, groupId, entry));
  if (!reproducesTasoPoints(fullSeason, teamRows, standIn)) {
    return {
      kind: "pass-through",
      groupId,
      groupName,
      // TASO's own order, since these are TASO's own numbers. A row it never
      // ranked sorts last, in the order TASO listed it — sorting those to the
      // top on a 0 would put an unranked team above the group winner.
      standings: [...teamRows]
        .sort(
          (left, right) =>
            (publishedPosition(left) ?? UNRANKED) - (publishedPosition(right) ?? UNRANKED)
        )
        // Called explicitly rather than passed by reference: `map` supplies a
        // third argument this takes no account of, and the index it does use
        // is deliberate, not an accident.
        .map((team, index) => toPassThroughStanding(team, index)),
    };
  }

  return {
    kind: "own-calculated",
    groupId,
    groupName,
    standings,
  };
}

/**
 * A cup group's table in the order TASO published, where it ranked every team;
 * otherwise our own order. Full season only.
 *
 * decisions/043-liigacup.md
 */
function inPublishedOrder(standings: TeamStanding[], teamRows: StoredGroupTeam[]): TeamStanding[] {
  const published = new Map(
    teamRows.map((row) => [row.teamProviderId, publishedPosition(row)] as const)
  );
  const ranked = standings.flatMap((team) => {
    const position = published.get(team.teamProviderId) ?? null;
    return position === null ? [] : [{ team, position }];
  });
  if (ranked.length < standings.length) return standings;

  return ranked
    .toSorted((left, right) => left.position - right.position)
    .map(({ team }, index) => ({ ...team, position: index + 1 }));
}
