/**
 * Finnish competitions from TASO: syncing a season's matches and group rows,
 * and the tables, rounds and team panels read from them.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 */

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { cache } from "react";
import { db, type Executor } from "@/db";
import { tasoGroupTeams, tasoMatches } from "@/db/schema";
import { getCached, getCachedUnlessDegraded } from "./cache";
import { isRoundRobin } from "./cup-rounds";
import {
  categoryIdForSeason,
  categoryIdsFor,
  competitionCodeForCategory,
  competitionIdForSeason,
  cupFormatFor,
  DOMESTIC_COMPETITIONS,
  earliestSeasonFor,
  getDomesticCompetitionName,
  isDomesticCup,
} from "./domestic-competitions";
import { logger } from "./logger";
import {
  lastRoundPlayedBy,
  type PositionPoint,
  type PositionSeries,
  positionsAfterEachRound,
  type RankedRow,
  teamsInGroupsAbove,
} from "./position-series";
import { parseWholeNumber } from "./provider-ids";
import {
  comparisonFor,
  RANKED_MEASURES,
  type SeasonComparisonSeries,
  type SeasonReadResult,
  UNRANKED_MEASURES,
} from "./season-comparison";
import { calculateStandings, selectTeamMatches, type TeamStanding } from "./standings";
import { competitionScope, recordsFor, type StreakRecordsSeries } from "./streak-records";
import {
  type Movement,
  midSeasonRound,
  movementBetween,
  type SeasonMovement,
} from "./table-volatility";
import {
  EARLIEST_TASO_SEASON,
  getCurrentSeason,
  getSeasonCategoryNames,
  getSeasonGroups,
  getSeasonMatches,
  type NormalizedTasoGroupTeam,
  type NormalizedTasoMatch,
  normalizeGroupTeams,
  parseProviderId,
  type TasoGroup,
} from "./taso";
import type { TeamPanelMatches } from "./team-panels";
import type { TeamSeason } from "./team-seasons";

const FINISHED_STATUS = "FINISHED";
/**
 * How long current-season TASO data stays fresh, in the database and in Redis.
 *
 * decisions/009-veikkausliiga.md
 */
const CURRENT_SEASON_CACHE_TTL_SECONDS = 15 * 60;

type StoredTasoMatch = typeof tasoMatches.$inferSelect;
type StoredGroupTeam = typeof tasoGroupTeams.$inferSelect;
/**
 * A match as stored or as freshly fetched: the same shape either way.
 *
 * decisions/009-veikkausliiga.md
 */
type MatchRow = NormalizedTasoMatch;

/**
 * One carry-over: this group continues its parent's points, so both groups'
 * matches are fed to `calculateStandings`.
 *
 * decisions/013-more-finnish-competitions.md
 */
type CarryOverEntry = {
  parent: number;
  /**
   * What TASO's `starting_points` means for this group. `true` (2015-2024): the
   * team's points in the parent, a seed. `false` (2025 on): 0 or a deduction, with
   * the parent's results already in the child's points.
   */
  seeded: boolean;
};

/**
 * Every carry-over, keyed by category, then season, then group. A test checks
 * each entry against TASO's published standings.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/127-carry-over-config-validation.md
 * decisions/133-split-group-round-numbering.md
 * decisions/272-group-standings-endpoint.md
 */
const CARRY_OVER_CONFIG: Record<string, Record<string, Record<number, CarryOverEntry>>> = {
  BTSM: {
    spljp15: { 3: { parent: 1, seeded: true }, 4: { parent: 2, seeded: true } },
  },
  M1: {
    spljp21: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
    /** Group 3 carries a −3 `starting_points` deduction. */
    spljp26: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
  },
  M1L: {
    spljp24: { 2: { parent: 1, seeded: false } },
  },
  M2: {
    spljp19: {
      4: { parent: 1, seeded: true },
      5: { parent: 2, seeded: true },
      6: { parent: 3, seeded: true },
    },
    spljp22: {
      4: { parent: 1, seeded: true },
      5: { parent: 2, seeded: true },
      6: { parent: 3, seeded: true },
    },
    spljp24: {
      4: { parent: 1, seeded: true },
      5: { parent: 2, seeded: true },
      6: { parent: 3, seeded: true },
      7: { parent: 1, seeded: true },
      8: { parent: 2, seeded: true },
      9: { parent: 3, seeded: true },
    },
    spljp25: {
      4: { parent: 1, seeded: false },
      5: { parent: 2, seeded: false },
      6: { parent: 3, seeded: false },
      7: { parent: 1, seeded: false },
      8: { parent: 2, seeded: false },
      9: { parent: 3, seeded: false },
    },
    spljp26: {
      4: { parent: 1, seeded: false },
      5: { parent: 2, seeded: false },
      6: { parent: 3, seeded: false },
      7: { parent: 1, seeded: false },
      8: { parent: 2, seeded: false },
      9: { parent: 3, seeded: false },
    },
  },
  N1: {
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false } },
    spljp26: { 2: { parent: 1, seeded: false } },
  },
  NL: {
    spljp15: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp16: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp17: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp18: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp19: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp21: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false } },
    spljp26: { 2: { parent: 1, seeded: false } },
  },
  VL: {
    spljp19: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp21: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp22: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp23: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp24: { 2: { parent: 1, seeded: true }, 3: { parent: 1, seeded: true } },
    spljp25: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
    /** TASO reports `starting_points` 0 for both groups, with the parent already in `points`. */
    spljp26: { 2: { parent: 1, seeded: false }, 3: { parent: 1, seeded: false } },
  },
};

/**
 * Every configured carry-over, flattened to one entry per `competitionId` and
 * `groupId`, for the test that checks each against TASO's published standings.
 *
 * decisions/127-carry-over-config-validation.md
 */
export function listCarryOverEntries(): {
  categoryId: string;
  competitionId: string;
  groupId: number;
}[] {
  return Object.entries(CARRY_OVER_CONFIG).flatMap(([categoryId, competitions]) =>
    Object.entries(competitions).flatMap(([competitionId, groups]) =>
      Object.keys(groups).map((groupId) => ({
        categoryId,
        competitionId,
        groupId: Number(groupId),
      }))
    )
  );
}

function carryOverEntry(
  categoryId: string,
  competitionId: string,
  groupId: number
): CarryOverEntry | null {
  return CARRY_OVER_CONFIG[categoryId]?.[competitionId]?.[groupId] ?? null;
}

function parentGroupId(categoryId: string, competitionId: string, groupId: number): number | null {
  return carryOverEntry(categoryId, competitionId, groupId)?.parent ?? null;
}

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

export type SeasonStandingsResult =
  | { status: "ok"; groups: GroupStandingsResult[] }
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
 * A stored match with a result, keeping the row's own type: the half-time score
 * rides on it, and the comebacks panel needs it.
 *
 * decisions/036-halftime-comebacks.md
 */
type FinishedMatchRow = MatchRow & { homeGoals: number; awayGoals: number };

/**
 * The played matches, in the order they were given.
 *
 * decisions/009-veikkausliiga.md
 * decisions/036-halftime-comebacks.md
 */
function toFinishedMatches(matchList: MatchRow[]): FinishedMatchRow[] {
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
 * Every season with something stored for this competition, across every
 * category id it has been published under.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/029-forced-season-refresh.md
 */
export async function storedTasoSeasons(competitionCode: string): Promise<Set<number>> {
  // Both tables: a season can hold group standings without matches. And every
  // category id, since a junior competition's rows are split across eras.
  const categoryIds = categoryIdsFor(competitionCode);
  const [matchSeasons, groupSeasons] = await Promise.all([
    db
      .selectDistinct({ seasonId: tasoMatches.seasonId })
      .from(tasoMatches)
      .where(inArray(tasoMatches.categoryId, categoryIds)),
    db
      .selectDistinct({ seasonId: tasoGroupTeams.seasonId })
      .from(tasoGroupTeams)
      .where(inArray(tasoGroupTeams.categoryId, categoryIds)),
  ]);
  return new Set([...matchSeasons, ...groupSeasons].map((row) => row.seasonId));
}

/**
 * The newest season we hold for a competition, or `null` for none.
 *
 * decisions/011-current-season-discovery.md
 * decisions/029-forced-season-refresh.md
 */
async function newestStoredSeason(competitionCode: string): Promise<number | null> {
  const seasons = await storedTasoSeasons(competitionCode);
  return seasons.size === 0 ? null : Math.max(...seasons);
}

/**
 * The current season from TASO, or null: an outage narrows the season range and
 * does not break the page. `failed` tells an outage from an answer naming none.
 *
 * decisions/011-current-season-discovery.md
 * decisions/534-taso-season-fallback-cache.md
 */
async function discoverCurrentSeason(): Promise<{ season: number | null; failed: boolean }> {
  try {
    return { season: await getCurrentSeason(), failed: false };
  } catch (error) {
    logger.warn({ err: error }, "TASO season discovery failed; falling back to stored seasons");
    return { season: null, failed: true };
  }
}

export type TasoSeasonContext = {
  /** The selector's ceiling, and the season `needsRefresh` treats as refreshable. */
  currentSeason: number;
  /** Where a page with no `kausi` param lands — never a season with no matches. */
  defaultSeason: number;
};

/**
 * The top of a competition's season range, and the newest season stored for it.
 * Reads only, so the forced refresh can call it before anything is approved.
 *
 * decisions/029-forced-season-refresh.md
 * decisions/534-taso-season-fallback-cache.md
 */
export const resolveTasoSeasonCeiling = cache(async function resolveTasoSeasonCeiling(
  competitionCode: string
): Promise<{
  currentSeason: number;
  newestStored: number | null;
  /** TASO could not be asked, so this ceiling is a fallback and was not cached. */
  discoveryFailed: boolean;
}> {
  return getCachedUnlessDegraded(
    `taso:season-ceiling:v2:${competitionCode}`,
    CURRENT_SEASON_CACHE_TTL_SECONDS,
    async () => {
      // The stored fallback is per competition, so the key is too.
      const [discovered, newestStored] = await Promise.all([
        discoverCurrentSeason(),
        newestStoredSeason(competitionCode),
      ]);
      // Floored at the competition's own first season, or a failed discovery with
      // nothing stored would put the ceiling below the floor and empty the selector.
      const currentSeason = Math.max(
        discovered.season ?? newestStored ?? EARLIEST_TASO_SEASON,
        earliestSeasonFor(competitionCode)
      );
      return {
        value: { currentSeason, newestStored, discoveryFailed: discovered.failed },
        degraded: discovered.failed,
      };
    }
  );
});

/**
 * A competition's season ceiling, and the season a page lands on: the newest
 * with matches, so a just-published season does not open empty.
 *
 * decisions/011-current-season-discovery.md
 * decisions/534-taso-season-fallback-cache.md
 */
export const resolveTasoSeasonContext = cache(async function resolveTasoSeasonContext(
  competitionCode: string
): Promise<TasoSeasonContext> {
  const key = `taso:season-context:v2:${competitionCode}`;
  return getCachedUnlessDegraded(key, CURRENT_SEASON_CACHE_TTL_SECONDS, async () => {
    const { currentSeason, newestStored, discoveryFailed } =
      await resolveTasoSeasonCeiling(competitionCode);
    let syncFailed = false;

    try {
      const { matches, refreshFailed } = await getSyncedSeasonMatches(
        categoryIdForSeason(competitionCode, currentSeason),
        // The competition's own id: Liigacup and Ykkösliigacup publish outside
        // the `spljpNN` umbrella, so probing that would find their current
        // season empty and default the page to an older one.
        competitionIdForSeason(competitionCode, currentSeason),
        currentSeason,
        currentSeason
      );
      syncFailed = refreshFailed;
      if (matches.length > 0) {
        return {
          value: { currentSeason, defaultSeason: currentSeason },
          degraded: discoveryFailed || syncFailed,
        };
      }
    } catch (error) {
      syncFailed = true;
      logger.warn(
        { err: error, competitionCode, currentSeason },
        "Unable to check the current season for matches"
      );
    }

    // Clamped to both ends of the selector's range: a default outside it lands the
    // page on a season the selector does not offer.
    const fallbackDefault = Math.max(
      earliestSeasonFor(competitionCode),
      Math.min(newestStored ?? currentSeason, currentSeason)
    );
    return {
      value: { currentSeason, defaultSeason: fallbackDefault },
      degraded: discoveryFailed || syncFailed,
    };
  });
});

/**
 * The name a competition carried in one season, or `null` when TASO cannot be
 * asked. Best-effort: the caller falls back to the current name.
 *
 * decisions/013-more-finnish-competitions.md
 */
export async function getSeasonCategoryName(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<string | null> {
  const ttl = seasonId >= activeSeasonId ? CURRENT_SEASON_CACHE_TTL_SECONDS : 60 * 60 * 24 * 365;
  try {
    const names = await getCached<Record<string, string>>(
      `taso:categories:${competitionId}`,
      ttl,
      () => getSeasonCategoryNames(competitionId)
    );
    return names[categoryId] ?? null;
  } catch (error) {
    logger.warn(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to read TASO category names; falling back to the configured name"
    );
    return null;
  }
}

/**
 * Every category name in one season, from the same cache entry. Unlike
 * `getSeasonCategoryName`, a failure is thrown.
 *
 * decisions/017-huuhkajat.md
 */
export function getSeasonCategoryNameMap(
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<Record<string, string>> {
  const ttl = seasonId >= activeSeasonId ? CURRENT_SEASON_CACHE_TTL_SECONDS : 60 * 60 * 24 * 365;
  return getCached<Record<string, string>>(`taso:categories:${competitionId}`, ttl, () =>
    getSeasonCategoryNames(competitionId)
  );
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
 * A group's own round numbers, or `null` when it has none.
 *
 * decisions/133-split-group-round-numbering.md
 */
function roundRange(matchList: MatchRow[], groupId: number): { min: number; max: number } | null {
  const rounds = matchList
    .filter((match) => match.groupId === groupId && match.matchday !== null)
    .map((match) => match.matchday as number);
  return rounds.length === 0 ? null : { min: Math.min(...rounds), max: Math.max(...rounds) };
}

/**
 * Shifts a carry-over group's rounds to continue from its parent's last one,
 * where they overlap the parent's. Does nothing where they already continue.
 *
 * decisions/133-split-group-round-numbering.md
 */
function withContinuedRoundNumbering(
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
const getSyncedSeasonMatches = cache(async function getSyncedSeasonMatches(
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
 * Replaces a season's stored group standings with the snapshot TASO returned,
 * in one transaction, so a failure leaves the previous snapshot in place.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/029-forced-season-refresh.md
 * decisions/196-concurrent-group-syncs.md
 */
export async function synchronizeGroupTeams(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  rows: NormalizedTasoGroupTeam[],
  /** The transaction to join, when a caller has one. Defaults to its own. */
  executor: Executor = db
): Promise<void> {
  // An empty snapshot is an answer too, and replaces what was stored.
  await executor.transaction(async (tx) => {
    await tx
      .delete(tasoGroupTeams)
      .where(
        and(
          eq(tasoGroupTeams.categoryId, categoryId),
          eq(tasoGroupTeams.competitionCode, competitionId),
          eq(tasoGroupTeams.seasonId, seasonId)
        )
      );

    if (rows.length === 0) return;

    // An upsert: on an empty table the delete locks nothing, so two concurrent
    // syncs would both insert and one would fail on the identity index.
    await tx
      .insert(tasoGroupTeams)
      .values(dedupeByIdentity(rows).map((row) => ({ ...row, updatedAt: new Date() })))
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
 * TASO's own group standings, stored and refreshed on the same rule as matches.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/272-group-standings-endpoint.md
 */
const getSyncedGroupTeams = cache(async function getSyncedGroupTeams(
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
    await synchronizeGroupTeams(categoryId, competitionId, seasonId, rows);
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

/**
 * One group's stored TASO rows.
 *
 * decisions/013-more-finnish-competitions.md
 */
function groupTeamsFor(teamRows: StoredGroupTeam[], groupId: number): StoredGroupTeam[] {
  return teamRows.filter((row) => row.groupId === groupId);
}

/**
 * Distinct group ids present in `matchList`, regardless of status.
 *
 * decisions/009-veikkausliiga.md
 */
function groupIdsIn(matchList: MatchRow[]): number[] {
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
function teamIdsInGroup(seasonMatches: MatchRow[], groupId: number): Set<number> {
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
function ownCalculatedStandings(
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
 * Whether our calculation reproduces TASO's published points for every team it
 * ranks, over the full season. This decides how a group renders.
 *
 * decisions/013-more-finnish-competitions.md
 */
function reproducesTasoPoints(standings: TeamStanding[], teamRows: StoredGroupTeam[]): boolean {
  // At least one row has points: `buildGroup` returns before calling this
  // when none does.
  const published = new Map(
    teamRows.flatMap((row) => (row.points === null ? [] : [[row.teamProviderId, row.points]]))
  );

  const calculated = new Set(standings.map((team) => team.teamProviderId));

  return (
    standings.every((team) => {
      const tasoPoints = published.get(team.teamProviderId);
      return tasoPoints === undefined || tasoPoints === team.points;
    }) && [...published.keys()].every((teamProviderId) => calculated.has(teamProviderId))
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
 * Every group of the season as it renders, before any round filter: own-calculated,
 * pass-through or a match list, by `group_id`. Shared by `getSeasonStandings`
 * and `listSeasonRounds`, so they agree on which groups a round applies to.
 *
 * decisions/010-playoff-group-match-list.md
 * decisions/013-more-finnish-competitions.md
 */
const classifySeasonGroups = cache(async function classifySeasonGroups(
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

  return { status: "ok", matches: seasonMatches, groups, teamRows };
});

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
 * Whether this TASO category belongs to a competition the registry calls a cup.
 *
 * decisions/040-cup-analytics.md
 */
function isCupCategory(categoryId: string): boolean {
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

type TableGroup = Pick<GroupStandingsResult, "kind" | "groupId">;

/**
 * A group's own-calculated table after a round, or at the end with `undefined`.
 *
 * decisions/050-table-volatility.md
 */
type TableAfter = (groupId: number) => (round: number | undefined) => TeamStanding[];

/**
 * Where one team's league season runs: its regular-season group, and the
 * continuation when it is a verified carry-over, with `offset` the teams ranked
 * above.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/050-table-volatility.md
 */
type LeaguePath =
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
function leaguePath(
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
 * Where a group's rounds begin, so the regular season sorts before its continuation.
 *
 * decisions/030-league-position-by-matchday.md
 */
function firstRoundOf(seasonMatches: MatchRow[], group: { groupId: number }): number {
  return roundRange(seasonMatches, group.groupId)?.min ?? Number.POSITIVE_INFINITY;
}

function seriesOf(
  points: PositionPoint[],
  teamCount: number,
  endsAtSplit: boolean
): PositionSeries {
  return { status: "ok", points, teamCount, endsAtSplit };
}

export async function getSeasonStandings(
  categoryId: string,
  competitionId: string,
  seasonId: number,
  activeSeasonId: number,
  round: number | undefined
): Promise<SeasonStandingsResult> {
  try {
    const classified = await classifySeasonGroups(
      categoryId,
      competitionId,
      seasonId,
      activeSeasonId
    );
    if (classified.status !== "ok") return { status: classified.status, groups: [] };
    if (round === undefined) return { status: "ok", groups: classified.groups };

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

    return { status: "ok", groups };
  } catch (error) {
    logger.error(
      { err: error, categoryId, competitionId, seasonId },
      "Unable to load TASO standings"
    );
    return { status: "error", groups: [] };
  }
}

/**
 * One group's rendering: a match list when it has no table, our table when it
 * reproduces TASO's points, and TASO's own numbers when it does not.
 *
 * decisions/013-more-finnish-competitions.md
 * decisions/043-liigacup.md
 * decisions/304-test-database.md
 */
function buildGroup(
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

  if (!reproducesTasoPoints(fullSeason, teamRows)) {
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
