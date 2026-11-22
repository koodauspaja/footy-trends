/**
 * Syncing a TASO season's matches, group rows and levels into storage, and
 * reading them back synced.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/816-split-by-job.md
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db, type Executor } from "@/db";
import { tasoGroupTeams, tasoGroupZones, tasoMatches } from "@/db/schema";
import { logger } from "../platform/logger";
import { publishesZones } from "./domestic-competitions";
import {
  getSeasonGroups,
  getSeasonMatches,
  type NormalizedTasoGroupLevel,
  type NormalizedTasoGroupTeam,
  type NormalizedTasoMatch,
  normalizeGroupLevels,
  normalizeGroupTeams,
  parseProviderId,
  type TasoGroup,
} from "./taso";
import { CARRY_OVER_CONFIG, parentGroupId } from "./taso-carry-over";
import {
  groupIdsIn,
  isUnplayedTable,
  type MatchRow,
  roundRange,
  type StoredGroupTeam,
  type StoredTasoMatch,
} from "./taso-tables";

/**
 * How long current-season TASO data stays fresh, in the database and in Redis.
 *
 * decisions/009-veikkausliiga.md
 */
export const CURRENT_SEASON_CACHE_TTL_SECONDS = 15 * 60;

/**
 * Whether to ask TASO: a season with nothing stored, or a stale active one. A
 * completed season never changes. `storedMatches` is newest `updatedAt` first.
 *
 * decisions/009-veikkausliiga.md
 */
export function needsRefresh(
  seasonId: number,
  activeSeasonId: number,
  storedMatches: Array<Pick<StoredTasoMatch, "updatedAt">>
): boolean {
  const newestUpdate = storedMatches[0]?.updatedAt;
  if (newestUpdate === undefined) return true;
  if (seasonId < activeSeasonId) return false;

  return Date.now() - newestUpdate.getTime() >= CURRENT_SEASON_CACHE_TTL_SECONDS * 1000;
}

/**
 * Stored rows, refreshed from TASO when stale. Round numbers are as TASO sends them.
 *
 * decisions/133-split-group-round-numbering.md
 */
async function loadSeasonMatches(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<{ matches: MatchRow[]; refreshFailed: boolean }> {
  const storedMatches = await db
    .select()
    .from(tasoMatches)
    .where(
      and(
        eq(tasoMatches.categoryId, categoryId),
        eq(tasoMatches.competitionCode, competitionId),
        eq(tasoMatches.seasonId, seasonId)
      )
    )
    .orderBy(desc(tasoMatches.updatedAt));

  if (!needsRefresh(seasonId, activeSeasonId, storedMatches)) {
    return { matches: storedMatches, refreshFailed: false };
  }

  try {
    const providerMatches = await getSeasonMatches(competitionId, categoryId, seasonId);
    await synchronizeMatches(providerMatches);
    return { matches: providerMatches, refreshFailed: false };
  } catch (error) {
    logger.warn(
      { err: error, categoryId, competitionId, seasonId },
      "TASO refresh failed; using stored matches"
    );
    return { matches: storedMatches, refreshFailed: true };
  }
}

/**
 * Shifts a carry-over group's rounds to continue from its parent's last one,
 * where they overlap the parent's. Does nothing where they already continue.
 *
 * decisions/133-split-group-round-numbering.md
 */
export function withContinuedRoundNumbering(
  matchList: MatchRow[],
  categoryId: string,
  competitionId: string
): MatchRow[] {
  const offsets = new Map<number, number>();

  for (const groupId of groupIdsIn(matchList)) {
    const parent = parentGroupId(categoryId, competitionId, groupId);
    if (parent === null) continue;

    const childRounds = roundRange(matchList, groupId);
    const parentRounds = roundRange(matchList, parent);
    if (childRounds === null || parentRounds === null) continue;
    // Already continues the parent's numbering — nothing to shift.
    if (childRounds.min > parentRounds.max) continue;

    // The child's first round lands on the parent's next one, wherever the child
    // starts: shifting by the parent's last round is right only from 1.
    offsets.set(groupId, parentRounds.max - childRounds.min + 1);
  }

  if (offsets.size === 0) return matchList;

  return matchList.map((match) => {
    const offset = offsets.get(match.groupId);
    return offset === undefined || match.matchday === null
      ? match
      : { ...match, matchday: match.matchday + offset };
  });
}

/**
 * The season's matches as every `/kotimaa` page reads them, rounds renumbered.
 * `cache()`d, so one request syncs a season at most once.
 *
 * decisions/009-veikkausliiga.md
 * decisions/133-split-group-round-numbering.md
 */
export const getSyncedSeasonMatches = cache(async function getSyncedSeasonMatches(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<{ matches: MatchRow[]; refreshFailed: boolean }> {
  const { matches, refreshFailed } = await loadSeasonMatches(
    categoryId,
    competitionId,
    seasonId,
    activeSeasonId
  );
  return {
    matches: withContinuedRoundNumbering(matches, categoryId, competitionId),
    refreshFailed,
  };
});

/**
 * Writes a TASO snapshot over the stored matches, deleting none.
 *
 * decisions/009-veikkausliiga.md
 * decisions/029-forced-season-refresh.md
 * decisions/678-stale-snapshot-written-last.md
 * decisions/076-guesses-on-irregular-matches.md
 */
export async function synchronizeMatches(
  providerMatches: NormalizedTasoMatch[],
  /** The transaction to join, when a caller has one. Defaults to its own. */
  executor: Executor = db
): Promise<void> {
  if (providerMatches.length === 0) return;

  await executor
    .insert(tasoMatches)
    .values(providerMatches.map((match) => ({ ...match, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: tasoMatches.providerMatchId,
      set: {
        competitionCode: sql`excluded.competition_id`,
        categoryId: sql`excluded.category_id`,
        seasonId: sql`excluded.season_id`,
        groupId: sql`excluded.group_id`,
        groupName: sql`excluded.group_name`,
        kickoffAt: sql`excluded.kickoff_at`,
        matchday: sql`excluded.matchday`,
        status: sql`excluded.status`,
        providerStatus: sql`excluded.provider_status`,
        winner: sql`excluded.winner`,
        homeTeamProviderId: sql`excluded.home_team_provider_id`,
        homeTeamName: sql`excluded.home_team_name`,
        awayTeamProviderId: sql`excluded.away_team_provider_id`,
        awayTeamName: sql`excluded.away_team_name`,
        homeGoals: sql`excluded.home_goals`,
        awayGoals: sql`excluded.away_goals`,
        halfTimeHome: sql`excluded.half_time_home`,
        halfTimeAway: sql`excluded.half_time_away`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * One row per team per group: the first wins. A knockout group returns a row
 * per bracket slot, and Postgres rejects an upsert that touches a row twice.
 *
 * decisions/013-more-finnish-competitions.md
 */
export function dedupeByIdentity(rows: NormalizedTasoGroupTeam[]): NormalizedTasoGroupTeam[] {
  const seen = new Map<string, NormalizedTasoGroupTeam>();
  for (const row of rows) {
    const identity = `${row.categoryId}/${row.competitionCode}/${row.seasonId}/${row.groupId}/${row.teamProviderId}`;
    if (!seen.has(identity)) seen.set(identity, row);
  }
  return [...seen.values()];
}

/**
 * Replaces a season's stored group standings and levels with the snapshot TASO
 * returned, in one transaction, so a failure leaves the previous snapshot in
 * place. With `carryStartingPoints`, an unplayed group keeps its starting points.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/029-forced-season-refresh.md
 * decisions/196-concurrent-group-syncs.md
 * decisions/628-zeroed-continuation-tables.md
 * decisions/063-competition-zones.md
 * decisions/678-stale-snapshot-written-last.md
 * decisions/871-season-sync-lock.md
 */
export async function synchronizeGroupTeams(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  rows: NormalizedTasoGroupTeam[],
  /** The levels of the same response, so no caller writes the rows without them. */
  levels: NormalizedTasoGroupLevel[],
  /** The transaction to join, when a caller has one. Defaults to its own. */
  executor: Executor = db,
  { carryStartingPoints = false }: { carryStartingPoints?: boolean } = {}
): Promise<void> {
  // An empty snapshot is an answer too, and replaces what was stored.
  await executor.transaction(async (tx) => {
    // One write of a season's group rows at a time, until its transaction ends:
    // two interleaving their deletes and upserts deadlock.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`taso-group-rows:${categoryId}:${competitionId}:${seasonId}`}))`
    );
    const season = and(
      eq(tasoGroupTeams.categoryId, categoryId),
      eq(tasoGroupTeams.competitionCode, competitionId),
      eq(tasoGroupTeams.seasonId, seasonId)
    );
    const snapshot = dedupeByIdentity(rows);
    const incoming = carryStartingPoints
      ? await withStoredStartingPoints(tx, season, snapshot)
      : snapshot;
    await tx.delete(tasoGroupTeams).where(season);
    await replaceGroupLevels(tx, categoryId, competitionId, seasonId, levels);

    if (incoming.length === 0) return;

    // An upsert: on an empty table the delete locks nothing, so two concurrent
    // syncs would both insert and one would fail on the identity index. Stored
    // under the season the delete cleared, whatever a row says of itself.
    const identity = { categoryId, competitionCode: competitionId, seasonId };
    await tx
      .insert(tasoGroupTeams)
      .values(incoming.map((row) => ({ ...row, ...identity, updatedAt: new Date() })))
      .onConflictDoUpdate({
        target: [
          tasoGroupTeams.categoryId,
          tasoGroupTeams.competitionCode,
          tasoGroupTeams.seasonId,
          tasoGroupTeams.groupId,
          tasoGroupTeams.teamProviderId,
        ],
        set: {
          teamName: sql`excluded.team_name`,
          startingPoints: sql`excluded.starting_points`,
          points: sql`excluded.points`,
          played: sql`excluded.matches_played`,
          won: sql`excluded.matches_won`,
          drawn: sql`excluded.matches_tied`,
          lost: sql`excluded.matches_lost`,
          goalsFor: sql`excluded.goals_for`,
          goalsAgainst: sql`excluded.goals_against`,
          goalDifference: sql`excluded.goals_diff`,
          currentStanding: sql`excluded.current_standing`,
          finalGroupStanding: sql`excluded.final_group_standing`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  });
}

/**
 * Replaces a season's stored levels with the snapshot's, through the caller's
 * transaction. Only the competitions that show zones store any.
 *
 * decisions/063-competition-zones.md
 * decisions/678-stale-snapshot-written-last.md
 */
async function replaceGroupLevels(
  tx: Executor,
  categoryId: string,
  competitionId: string,
  seasonId: number,
  levels: NormalizedTasoGroupLevel[]
): Promise<void> {
  if (!publishesZones(categoryId)) return;

  await tx
    .delete(tasoGroupZones)
    .where(
      and(
        eq(tasoGroupZones.categoryId, categoryId),
        eq(tasoGroupZones.competitionCode, competitionId),
        eq(tasoGroupZones.seasonId, seasonId)
      )
    );

  // One row per group and level: the first wins, as for the team rows.
  const incoming = new Map<string, NormalizedTasoGroupLevel>();
  for (const row of levels) {
    const identity = `${row.groupId}/${row.level}`;
    if (!incoming.has(identity)) incoming.set(identity, row);
  }
  if (incoming.size === 0) return;

  // An upsert, for the reason the team rows have one, under the season the
  // delete cleared.
  const season = { categoryId, competitionCode: competitionId, seasonId };
  await tx
    .insert(tasoGroupZones)
    .values([...incoming.values()].map((row) => ({ ...row, ...season, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: [
        tasoGroupZones.categoryId,
        tasoGroupZones.competitionCode,
        tasoGroupZones.seasonId,
        tasoGroupZones.groupId,
        tasoGroupZones.level,
      ],
      set: {
        teamCount: sql`excluded.team_count`,
        label: sql`excluded.label`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * Replaces a season's stored levels and nothing else: the team rows are left
 * as they are. For the one-off backfill of seasons that are never refetched.
 *
 * decisions/063-competition-zones.md
 */
export async function synchronizeGroupLevels(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  levels: NormalizedTasoGroupLevel[]
): Promise<void> {
  await db.transaction((tx) => replaceGroupLevels(tx, categoryId, competitionId, seasonId, levels));
}

/**
 * The snapshot, with each team's stored starting point put back where a group
 * has come back unplayed and without it: the one figure the matches cannot
 * give back. Reads nothing when no group of the snapshot is unplayed.
 *
 * decisions/628-zeroed-continuation-tables.md
 */
async function withStoredStartingPoints(
  tx: Executor,
  season: ReturnType<typeof and>,
  snapshot: NormalizedTasoGroupTeam[]
): Promise<NormalizedTasoGroupTeam[]> {
  const unplayed = [...new Set(snapshot.map((row) => row.groupId))].filter((groupId) =>
    isUnplayedTable(snapshot.filter((row) => row.groupId === groupId))
  );
  if (unplayed.length === 0) return snapshot;

  const stored = await tx
    .select()
    .from(tasoGroupTeams)
    .where(and(season, inArray(tasoGroupTeams.groupId, unplayed)));
  const startingPoints = new Map(
    stored.map((row) => [`${row.groupId}/${row.teamProviderId}`, row.startingPoints ?? 0])
  );
  return snapshot.map((row) => {
    // Only the unplayed groups' rows were read, so only theirs can be found.
    const kept = startingPoints.get(`${row.groupId}/${row.teamProviderId}`) ?? 0;
    return (row.startingPoints ?? 0) === 0 && kept !== 0 ? { ...row, startingPoints: kept } : row;
  });
}

/**
 * TASO's own group standings, stored and refreshed on the same rule as matches.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/272-group-standings-endpoint.md
 */
export const getSyncedGroupTeams = cache(async function getSyncedGroupTeams(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<StoredGroupTeam[]> {
  const stored = await db
    .select()
    .from(tasoGroupTeams)
    .where(
      and(
        eq(tasoGroupTeams.categoryId, categoryId),
        eq(tasoGroupTeams.competitionCode, competitionId),
        eq(tasoGroupTeams.seasonId, seasonId)
      )
    )
    .orderBy(desc(tasoGroupTeams.updatedAt));

  if (!needsRefresh(seasonId, activeSeasonId, stored)) return stored;

  try {
    const groups = await getSeasonGroups(competitionId, categoryId);
    reportUnconfiguredContinuations(groups, categoryId, competitionId, seasonId);
    const rows = normalizeGroupTeams(groups, categoryId, competitionId, seasonId);
    const levels = normalizeGroupLevels(groups, categoryId, competitionId, seasonId);
    await synchronizeGroupTeams(categoryId, competitionId, seasonId, rows, levels, db, {
      carryStartingPoints: true,
    });
    // Re-read rather than returning `rows`: the caller needs full stored rows,
    // and the snapshot has just replaced whatever was there.
    return await db
      .select()
      .from(tasoGroupTeams)
      .where(
        and(
          eq(tasoGroupTeams.categoryId, categoryId),
          eq(tasoGroupTeams.competitionCode, competitionId),
          eq(tasoGroupTeams.seasonId, seasonId)
        )
      )
      .orderBy(desc(tasoGroupTeams.updatedAt));
  } catch (error) {
    // An error, with `stored` to tell stale rows from none at all.
    logger.error(
      { err: error, categoryId, competitionId, seasonId, stored: stored.length },
      "TASO group refresh failed; falling back to stored group standings"
    );
    return stored;
  }
});

/**
 * Logs a continuation group that has no `CARRY_OVER_CONFIG` entry. Runs only
 * where groups are fetched, which is the season being played.
 *
 * decisions/281-missing-carry-over-entry.md
 */
function reportUnconfiguredContinuations(
  groups: TasoGroup[],
  categoryId: string,
  competitionId: string,
  seasonId: number
): void {
  const configured = CARRY_OVER_CONFIG[categoryId]?.[competitionId] ?? {};

  for (const group of groups) {
    if (group.group_type !== "additional_group_stage") continue;

    // Validated as `normalizeGroupTeams` validates it, so the groups reported on
    // are the groups stored.
    const groupId = parseProviderId(group.group_id);
    if (groupId === null) continue;

    if (configured[groupId] !== undefined) continue;

    logger.error(
      {
        categoryId,
        competitionId,
        seasonId,
        groupId,
        groupName: group.group_name,
        tasoParentHint: group.import_match_group_id,
      },
      "Continuation group has no carry-over entry; its standings will omit the parent round"
    );
  }
}
