/**
 * Finnish competitions' tables, rounds, match lists and table movement, read
 * from the synced rows.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/816-split-by-job.md
 */

import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { tasoGroupTeams, tasoGroupZones, tasoMatches } from "@/db/schema";
import {
  type Movement,
  midSeasonRound,
  movementBetween,
  type SeasonMovement,
} from "../analytics/table-volatility";
import { leagueGroupOrder } from "../competitions/group-order";
import { selectTeamMatches, type TeamStanding } from "../competitions/standings";
import { logger } from "../platform/logger";
import { parseWholeNumber } from "../providers/provider-ids";
import type { RankedRow } from "../teams/position-series";
import {
  categoryIdForSeason,
  categoryIdsFor,
  competitionIdForSeason,
  publishesZones,
} from "./domestic-competitions";
import { parentGroupId } from "./taso-carry-over";
import {
  getSyncedGroupTeams,
  getSyncedSeasonMatches,
  withContinuedRoundNumbering,
} from "./taso-sync";
import {
  buildGroup,
  type GroupStandingsResult,
  groupIdsIn,
  groupTeamsFor,
  isCupCategory,
  type LeaguePath,
  leaguePath,
  type MatchRow,
  ownCalculatedStandings,
  type StoredGroupTeam,
  type StoredGroupZone,
  type TableAfter,
  teamIdsInGroup,
} from "./taso-tables";

/**
 * One stored level of a group: the places it takes and what they lead to.
 *
 * decisions/063-competition-zones.md
 */
export type GroupLevel = Pick<StoredGroupZone, "groupId" | "level" | "teamCount" | "label">;

export type SeasonStandingsResult =
  | {
      status: "ok";
      groups: GroupStandingsResult[];
      /** Every stored level of the season's groups, in each group's own order. */
      levels: GroupLevel[];
    }
  | { status: "empty"; groups: [] }
  | { status: "error"; groups: [] };

export type SeasonMatchesResult =
  | { status: "ok"; matches: MatchRow[] }
  | { status: "empty" }
  | { status: "error" };

export type TeamMatchesResult =
  | { status: "ok"; matches: MatchRow[] }
  | { status: "not_found" }
  | { status: "empty" }
  | { status: "error" };

/**
 * Every group of the season as it renders, before any round filter: own-calculated,
 * pass-through or a match list, by `group_id`. Shared by `getSeasonStandings`,
 * `listSeasonRounds` and `getSeasonTables`, so they agree on every group.
 *
 * decisions/010-playoff-group-match-list.md
 * decisions/013-more-finnish-competitions.md
 * decisions/061-season-simulation.md
 */
export const classifySeasonGroups = cache(async function classifySeasonGroups(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<
  | {
      status: "ok";
      matches: MatchRow[];
      groups: GroupStandingsResult[];
      /** Returned so a caller never reads them a second time. */
      teamRows: StoredGroupTeam[];
      /** The matches are stored rows TASO could not be asked to refresh. */
      refreshFailed: boolean;
    }
  | { status: "empty" | "error" }
> {
  const [{ matches: seasonMatches, refreshFailed }, teamRows] = await Promise.all([
    getSyncedSeasonMatches(categoryId, competitionId, seasonId, activeSeasonId),
    getSyncedGroupTeams(categoryId, competitionId, seasonId, activeSeasonId),
  ]);

  if (seasonMatches.length === 0) {
    return refreshFailed ? { status: "error" } : { status: "empty" };
  }

  if (teamRows.length === 0) {
    logger.warn(
      { categoryId, competitionId, seasonId },
      "No stored TASO group standings; calculating without starting_points adjustments"
    );
  }

  const groups = groupIdsIn(seasonMatches)
    .sort((left, right) => left - right)
    .map((groupId) => buildGroup(seasonMatches, teamRows, categoryId, competitionId, groupId));

  return { status: "ok", matches: seasonMatches, groups, teamRows, refreshFailed };
});

/**
 * One completed season's table movement: each team's position at the halfway
 * round against its final one, in its own pool. `null` when the season has no
 * per-round table to compare.
 *
 * decisions/050-table-volatility.md
 */
export function seasonMovementFrom(
  seasonMatches: MatchRow[],
  teamRows: StoredGroupTeam[],
  categoryId: string,
  competitionId: string
): Movement | null {
  const tableGroups = groupIdsIn(seasonMatches)
    .sort((left, right) => left - right)
    .map((groupId) => buildGroup(seasonMatches, teamRows, categoryId, competitionId, groupId))
    .filter((group) => group.kind !== "match-list");

  // Every team asks for the same few tables, so each is calculated once.
  const tables = new Map<string, TeamStanding[]>();
  const tableAfter: TableAfter = (groupId) => (round) => {
    const key = `${groupId}:${round}`;
    const table =
      tables.get(key) ??
      ownCalculatedStandings(
        seasonMatches,
        groupTeamsFor(teamRows, groupId),
        categoryId,
        competitionId,
        groupId,
        round
      );
    tables.set(key, table);
    return table;
  };

  const teams = new Set(
    tableGroups.flatMap((group) => [...teamIdsInGroup(seasonMatches, group.groupId)])
  );
  const midSeason: RankedRow[] = [];
  const final: RankedRow[] = [];
  for (const teamId of teams) {
    const path = leaguePath(
      seasonMatches,
      tableGroups,
      categoryId,
      competitionId,
      teamId,
      tableAfter
    );
    if (path === null) return null;

    const groupIds = new Set([path.regular.groupId, path.continuation?.groupId]);
    const rounds = seasonMatches.flatMap((match) =>
      groupIds.has(match.groupId) && match.matchday !== null ? [match.matchday] : []
    );
    if (rounds.length === 0) return null;

    const round = midSeasonRound(Math.max(...rounds));
    const endsIn = finalTableOf(path, tableAfter);
    if (endsIn === null) return null;
    midSeason.push(...rowOf(tableAfter(path.regular.groupId)(round), teamId, 0));
    final.push(...rowOf(endsIn.table, teamId, endsIn.offset));
  }
  return movementBetween(midSeason, final);
}

/**
 * The table a team's season ends in, and the places above it, or `null` when it
 * cannot be combined.
 *
 * decisions/050-table-volatility.md
 */
function finalTableOf(
  path: LeaguePath,
  tableAfter: TableAfter
): { table: TeamStanding[]; offset: number } | null {
  if (path.continuation === undefined) {
    return { table: tableAfter(path.regular.groupId)(undefined), offset: 0 };
  }
  return path.combinable
    ? { table: tableAfter(path.continuation.groupId)(undefined), offset: path.offset }
    : null;
}

/**
 * This team's row as a ranked row, or none when the table lacks it.
 *
 * decisions/050-table-volatility.md
 */
function rowOf(table: readonly TeamStanding[], teamId: number, offset: number): RankedRow[] {
  return table
    .filter((row) => row.teamProviderId === teamId)
    .map((row) => ({ teamProviderId: teamId, position: row.position + offset }));
}

/**
 * Each completed season's table movement in one domestic competition, from
 * stored rows only.
 *
 * decisions/050-table-volatility.md
 */
export async function getTasoSeasonMovements(
  code: string,
  activeSeasonId: number
): Promise<SeasonMovement[]> {
  const categoryIds = categoryIdsFor(code);
  const [storedMatches, storedTeams] = await Promise.all([
    db
      .select()
      .from(tasoMatches)
      .where(
        and(inArray(tasoMatches.categoryId, categoryIds), lt(tasoMatches.seasonId, activeSeasonId))
      )
      .orderBy(desc(tasoMatches.updatedAt)),
    db
      .select()
      .from(tasoGroupTeams)
      .where(
        and(
          inArray(tasoGroupTeams.categoryId, categoryIds),
          lt(tasoGroupTeams.seasonId, activeSeasonId)
        )
      )
      .orderBy(desc(tasoGroupTeams.updatedAt)),
  ]);

  return [...new Set(storedMatches.map((match) => match.seasonId))].flatMap((seasonId) => {
    const categoryId = categoryIdForSeason(code, seasonId);
    const competitionId = competitionIdForSeason(code, seasonId);
    const own = (row: { seasonId: number; categoryId: string; competitionCode: string }) =>
      row.seasonId === seasonId &&
      row.categoryId === categoryId &&
      row.competitionCode === competitionId;
    const seasonMatches = storedMatches.filter(own);
    if (seasonMatches.length === 0) return [];

    return [
      {
        seasonId,
        movement: seasonMovementFrom(
          withContinuedRoundNumbering(seasonMatches, categoryId, competitionId),
          storedTeams.filter(own),
          categoryId,
          competitionId
        ),
      },
    ];
  });
}

/**
 * A season's stored levels, each group's in TASO's order.
 *
 * decisions/063-competition-zones.md
 */
async function storedGroupLevels(
  categoryId: string,
  competitionId: string,
  seasonId: number
): Promise<GroupLevel[]> {
  return await db
    .select({
      groupId: tasoGroupZones.groupId,
      level: tasoGroupZones.level,
      teamCount: tasoGroupZones.teamCount,
      label: tasoGroupZones.label,
    })
    .from(tasoGroupZones)
    .where(
      and(
        eq(tasoGroupZones.categoryId, categoryId),
        eq(tasoGroupZones.competitionCode, competitionId),
        eq(tasoGroupZones.seasonId, seasonId)
      )
    )
    .orderBy(asc(tasoGroupZones.groupId), asc(tasoGroupZones.level));
}

/**
 * A season's groups and levels. `order: "league"` gives a league's tables, later
 * phases first, then its match lists; the default keeps TASO's order.
 *
 * decisions/009-veikkausliiga.md
 * decisions/714-page-section-order.md
 */
export async function getSeasonStandings(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number,
  round: number | undefined,
  order: "league" | "taso" = "taso"
): Promise<SeasonStandingsResult> {
  try {
    const classified = await classifySeasonGroups(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (classified.status !== "ok") return { status: classified.status, groups: [] };
    const ordered = (groups: GroupStandingsResult[]) =>
      order === "league" ? leagueGroupOrder(groups, classified.matches) : groups;
    // After the classification, whose refresh is what writes them. A competition
    // that stores none is not asked.
    const levels = publishesZones(categoryId)
      ? await storedGroupLevels(categoryId, competitionId, seasonId)
      : [];
    if (round === undefined) {
      return { status: "ok", groups: ordered(classified.groups), levels };
    }

    // Only an own-calculated group responds to a round; the classification
    // itself does not change with one, so it is reused rather than redone —
    // and so are the group rows it read, rather than asking for them again.
    const groups = classified.groups.map((group) =>
      group.kind === "own-calculated"
        ? {
            ...group,
            standings: ownCalculatedStandings(
              classified.matches,
              groupTeamsFor(classified.teamRows, group.groupId),
              categoryId,
              competitionId,
              group.groupId,
              round
            ),
          }
        : group
    );

    return { status: "ok", groups: ordered(groups), levels };
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to load TASO standings"
    );
    return { status: "error", groups: [] };
  }
}

/**
 * One stored group of a season for the season forecast: how it renders, our
 * table when it is ours, its own matches of every status, and the group it
 * carries points over from.
 *
 * decisions/061-season-simulation.md
 * decisions/064-season-simulation-zones.md
 */
export type SeasonTable = {
  groupId: number;
  groupName: string;
  kind: GroupStandingsResult["kind"];
  /** Empty unless the group is `own-calculated`. */
  standings: TeamStanding[];
  matches: MatchRow[];
  parentGroupId: number | null;
  /** The group's stored levels; empty when it has none. */
  levels: GroupLevel[];
};

/**
 * Every stored group of a season as the standings page classifies it, read
 * through the page's own refresh of matches and group rows. `refreshFailed`
 * when the matches are stored rows TASO could not be asked to refresh.
 *
 * decisions/061-season-simulation.md
 * decisions/064-season-simulation-zones.md
 */
export async function getSeasonTables(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<
  { status: "ok"; tables: SeasonTable[]; refreshFailed: boolean } | { status: "empty" | "error" }
> {
  const classified = await classifySeasonGroups(
    categoryId,
    competitionId,
    seasonId,
    activeSeasonId
  );
  if (classified.status !== "ok") return { status: classified.status };

  // After the classification, whose refresh is what writes them, as the
  // standings page reads them. A competition that stores none is not asked.
  const levels = publishesZones(categoryId)
    ? await storedGroupLevels(categoryId, competitionId, seasonId)
    : [];

  return {
    status: "ok",
    refreshFailed: classified.refreshFailed,
    tables: classified.groups.map((group) => ({
      groupId: group.groupId,
      groupName: group.groupName,
      kind: group.kind,
      standings: group.kind === "own-calculated" ? group.standings : [],
      matches: classified.matches.filter((match) => match.groupId === group.groupId),
      parentGroupId: parentGroupId(categoryId, competitionId, group.groupId),
      levels: levels.filter((level) => level.groupId === group.groupId),
    })),
  };
}

/**
 * Every match for the season, across every group, sorted by kickoff time.
 *
 * decisions/009-veikkausliiga.md
 */
export async function getSeasonMatchList(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<SeasonMatchesResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error" } : { status: "empty" };
    }
    return {
      status: "ok",
      matches: [...seasonMatches].sort(
        (left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime()
      ),
    };
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to load TASO season matches"
    );
    return { status: "error" };
  }
}

/**
 * A team's matches for the season, across every group it appeared in, chronologically.
 *
 * decisions/009-veikkausliiga.md
 */
export async function getTeamMatches(
  categoryId: string,
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<TeamMatchesResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error" } : { status: "empty" };
    }

    const teamMatches = selectTeamMatches(seasonMatches, teamProviderId);

    if (teamMatches.length === 0) return { status: "not_found" };
    return { status: "ok", matches: teamMatches };
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId, teamProviderId },
      "Unable to load TASO team matches"
    );
    return { status: "error" };
  }
}

/**
 * Every round present across the season's own-calculated groups, ascending: one
 * scale for the page's single selector.
 *
 * decisions/009-veikkausliiga.md
 */
export function listSelectableTasoRounds(
  matchList: MatchRow[],
  tableGroupIds: Set<number>
): number[] {
  const rounds = matchList
    .filter((match) => match.matchday !== null && tableGroupIds.has(match.groupId))
    .map((match) => match.matchday as number);
  return [...new Set(rounds)].sort((left, right) => left - right);
}

/**
 * The rounds a page's selector offers for the season: those of its
 * own-calculated groups, and none for a cup.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/043-liigacup.md
 */
export async function listSeasonRounds(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<number[]> {
  try {
    const classified = await classifySeasonGroups(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (classified.status !== "ok") return [];
    // A cup page has no round selector.
    if (isCupCategory(categoryId)) return [];

    // Own-calculated only: any other group's rounds would filter nothing.
    const roundedGroupIds = new Set(
      classified.groups
        .filter((group) => group.kind === "own-calculated")
        .map((group) => group.groupId)
    );
    return listSelectableTasoRounds(classified.matches, roundedGroupIds);
  } catch (error) {
    logger.warn(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to list TASO rounds; offering none"
    );
    return [];
  }
}

export type TasoRoundParamResult =
  | { kind: "absent" }
  | { kind: "valid"; round: number }
  | { kind: "invalid" };

/**
 * The `kierros` parameter, accepted only when it is one of the rounds
 * `listSelectableTasoRounds` returned.
 *
 * decisions/009-veikkausliiga.md
 */
export function parseTasoRoundParam(
  rawValue: string | string[] | undefined,
  availableRounds: number[]
): TasoRoundParamResult {
  if (rawValue === undefined || rawValue === "") return { kind: "absent" };
  const round = parseWholeNumber(rawValue);
  return round !== null && availableRounds.includes(round)
    ? { kind: "valid", round }
    : { kind: "invalid" };
}
