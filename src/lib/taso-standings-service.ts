import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { tasoMatches } from "@/db/schema";
import { getCached } from "./cache";
import { logger } from "./logger";
import {
  calculateStandings,
  type NormalizedMatch,
  selectTeamMatches,
  type TeamStanding,
} from "./standings";
import {
  getSeasonGroups,
  getSeasonMatches,
  type NormalizedTasoMatch,
  type TasoGroup,
  type TasoGroupTeam,
} from "./taso";

const FINISHED_STATUS = "FINISHED";
/**
 * Shared by `needsRefresh` (current-season match staleness) and
 * `getCachedSeasonGroups` (current-season groups cache) — one constant,
 * not two, since `taso.ts` itself does no caching of its own; both uses
 * live here where they're actually consumed. See
 * specs/009-veikkausliiga.md's caching section.
 */
const CURRENT_SEASON_CACHE_TTL_SECONDS = 15 * 60;

type StoredTasoMatch = typeof tasoMatches.$inferSelect;
/** A match from either the DB or a fresh provider fetch — same duality as football-data.ts. */
type MatchRow = NormalizedTasoMatch;

/**
 * `competitionId + groupId → parentGroupId`. A group with no entry here
 * (including every season's `group_id=1`) has no carry-over dependency and
 * is always own-calculated directly from its own matches. Only a group
 * confirmed — via TASO's own `starting_points` and/or a from-scratch
 * `calculateStandings` cross-check — to continue its parent's points gets
 * an entry. See specs/009-veikkausliiga.md.
 */
const CARRY_OVER_CONFIG: Record<string, Record<number, number>> = {
  spljp21: { 2: 1, 3: 1 },
  spljp22: { 2: 1, 3: 1 },
  spljp23: { 2: 1, 3: 1 },
  spljp24: { 2: 1, 3: 1 },
  spljp25: { 2: 1, 3: 1 },
};

function parentGroupId(competitionId: string, groupId: number): number | null {
  return CARRY_OVER_CONFIG[competitionId]?.[groupId] ?? null;
}

/** Own-calculated groups always have a carry-over entry, or are the season's origin group (no group needs the entry to be own-calculated when it has no parent). */
function isOwnCalculated(competitionId: string, groupId: number, allGroupIds: number[]): boolean {
  if (parentGroupId(competitionId, groupId) !== null) return true;
  // The origin group is whichever group has no parent and is the lowest
  // group_id present — per spec, group_id=1 in every season checked.
  return groupId === Math.min(...allGroupIds);
}

/**
 * A pass-through group's standing, straight from TASO's own `getGroups`
 * numbers — nullable, unlike `TeamStanding`, because a group like
 * Eurolopputurnaus genuinely has no points/stats (confirmed `null` for
 * every team, every year checked). The page renders a null field as "–"
 * rather than coercing it to a misleading `0`. `form` is always empty:
 * pass-through groups have no match-by-match data to derive it from.
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

export type GroupStandingsResult =
  | { kind: "own-calculated"; groupId: number; groupName: string; standings: TeamStanding[] }
  | { kind: "pass-through"; groupId: number; groupName: string; standings: TasoTeamStanding[] };

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

function toFinishedMatches(matchList: MatchRow[]): NormalizedMatch[] {
  return matchList.filter(
    (match): match is MatchRow & { homeGoals: number; awayGoals: number } =>
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
 * A completed season (every season except the newest, which is still being
 * played) never changes once synced, so it is fetched at most once — the
 * freshness threshold below only applies to the season currently being
 * played. Mirrors `needsRefresh` in standings-service.ts — see
 * specs/009-veikkausliiga.md's caching section.
 *
 * `storedMatches` must be ordered newest `updatedAt` first.
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

async function getSyncedSeasonMatches(
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<{ matches: MatchRow[]; refreshFailed: boolean }> {
  const storedMatches = await db
    .select()
    .from(tasoMatches)
    .where(and(eq(tasoMatches.competitionCode, competitionId), eq(tasoMatches.seasonId, seasonId)))
    .orderBy(desc(tasoMatches.updatedAt));

  if (!needsRefresh(seasonId, activeSeasonId, storedMatches)) {
    return { matches: storedMatches, refreshFailed: false };
  }

  try {
    const providerMatches = await getSeasonMatches(competitionId);
    await synchronizeMatches(providerMatches);
    return { matches: providerMatches, refreshFailed: false };
  } catch (error) {
    logger.warn(
      { err: error, competitionId, seasonId },
      "TASO refresh failed; using stored matches"
    );
    return { matches: storedMatches, refreshFailed: true };
  }
}

export async function synchronizeMatches(providerMatches: NormalizedTasoMatch[]): Promise<void> {
  if (providerMatches.length === 0) return;

  await db
    .insert(tasoMatches)
    .values(providerMatches.map((match) => ({ ...match, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: tasoMatches.providerMatchId,
      set: {
        competitionCode: sql`excluded.competition_id`,
        seasonId: sql`excluded.season_id`,
        groupId: sql`excluded.group_id`,
        groupName: sql`excluded.group_name`,
        kickoffAt: sql`excluded.kickoff_at`,
        matchday: sql`excluded.matchday`,
        status: sql`excluded.status`,
        homeTeamProviderId: sql`excluded.home_team_provider_id`,
        homeTeamName: sql`excluded.home_team_name`,
        awayTeamProviderId: sql`excluded.away_team_provider_id`,
        awayTeamName: sql`excluded.away_team_name`,
        homeGoals: sql`excluded.home_goals`,
        awayGoals: sql`excluded.away_goals`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/** Distinct group ids present in `matchList`, regardless of status. */
function groupIdsIn(matchList: MatchRow[]): number[] {
  return [...new Set(matchList.map((match) => match.groupId))];
}

/** `groupId` always comes from `groupIdsIn(matchList)`, so a match always exists. */
function groupNameOf(matchList: MatchRow[], groupId: number): string {
  // biome-ignore lint/style/noNonNullAssertion: groupId is always derived from this same matchList
  return matchList.find((match) => match.groupId === groupId)!.groupName;
}

function toPassThroughStanding(team: TasoGroupTeam, index: number): TasoTeamStanding {
  const finalStanding =
    team.final_group_standing === undefined || team.final_group_standing === null
      ? null
      : Number(team.final_group_standing);
  return {
    position: team.current_standing ?? finalStanding ?? index + 1,
    teamProviderId: team.team_id === undefined ? 0 : Number(team.team_id),
    teamName: team.team_name ?? "",
    played: team.matches_played ?? null,
    won: team.matches_won ?? null,
    drawn: team.matches_tied ?? null,
    lost: team.matches_lost ?? null,
    goalsFor: team.goals_for ?? null,
    goalsAgainst: team.goals_against ?? null,
    goalDifference: team.goals_diff ?? null,
    points: team.points ?? null,
    form: [],
  };
}

/**
 * Every group TASO returns for the season, each rendered either
 * own-calculated (via `calculateStandings`, including the parent group's
 * matches for a carry-over continuation group) or pass-through (TASO's own
 * precomputed `getGroups` numbers, for a group like Eurolopputurnaus that
 * isn't a points competition at all). Ordered by `group_id` ascending —
 * `phase_number` is confirmed unreliable for ordering.
 */
export async function getSeasonStandings(
  competitionId: string,
  seasonId: number,
  activeSeasonId: number,
  round: number | undefined
): Promise<SeasonStandingsResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
      competitionId,
      seasonId,
      activeSeasonId
    );

    if (seasonMatches.length === 0) {
      return refreshFailed ? { status: "error", groups: [] } : { status: "empty", groups: [] };
    }

    const allGroupIds = groupIdsIn(seasonMatches).sort((left, right) => left - right);
    const ownCalculatedGroupIds = new Set(
      allGroupIds.filter((groupId) => isOwnCalculated(competitionId, groupId, allGroupIds))
    );
    const passThroughGroupIds = allGroupIds.filter(
      (groupId) => !ownCalculatedGroupIds.has(groupId)
    );

    const groups: GroupStandingsResult[] = [];

    for (const groupId of allGroupIds) {
      if (ownCalculatedGroupIds.has(groupId)) {
        const parent = parentGroupId(competitionId, groupId);
        const ownMatches = seasonMatches.filter(
          (match) => match.groupId === groupId || (parent !== null && match.groupId === parent)
        );
        const standings = calculateStandings(
          filterByRound(toFinishedMatches(ownMatches), round),
          ownMatches
        );
        groups.push({
          kind: "own-calculated",
          groupId,
          groupName: groupNameOf(seasonMatches, groupId),
          standings,
        });
      }
    }

    if (passThroughGroupIds.length > 0) {
      const tasoGroups = await getCachedSeasonGroups(competitionId, seasonId, activeSeasonId);
      for (const groupId of passThroughGroupIds) {
        const tasoGroup = tasoGroups.find((group) => Number(group.group_id) === groupId);
        const standings = (tasoGroup?.teams ?? []).map((team, index) =>
          toPassThroughStanding(team, index)
        );
        groups.push({
          kind: "pass-through",
          groupId,
          groupName: groupNameOf(seasonMatches, groupId),
          standings,
        });
      }
    }

    groups.sort((left, right) => left.groupId - right.groupId);
    return { status: "ok", groups };
  } catch (error) {
    logger.error({ err: error, competitionId, seasonId }, "Unable to load TASO standings");
    return { status: "error", groups: [] };
  }
}

async function getCachedSeasonGroups(
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<TasoGroup[]> {
  const ttl = seasonId >= activeSeasonId ? CURRENT_SEASON_CACHE_TTL_SECONDS : 60 * 60 * 24 * 365;
  return getCached(`taso:groups:${competitionId}`, ttl, () => getSeasonGroups(competitionId));
}

/** Every match for the season, across every group, sorted by kickoff time. */
export async function getSeasonMatchList(
  competitionId: string,
  seasonId: number,
  activeSeasonId: number
): Promise<SeasonMatchesResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
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
    logger.error({ err: error, competitionId, seasonId }, "Unable to load TASO season matches");
    return { status: "error" };
  }
}

/** A team's matches for the season, across every group it appeared in, chronologically. */
export async function getTeamMatches(
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  activeSeasonId: number
): Promise<TeamMatchesResult> {
  try {
    const { matches: seasonMatches, refreshFailed } = await getSyncedSeasonMatches(
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
      { err: error, competitionId, seasonId, teamProviderId },
      "Unable to load TASO team matches"
    );
    return { status: "error" };
  }
}

/**
 * Every round_id present across the season's own-calculated groups,
 * ascending — one shared, continuous round scale for the whole page's round
 * selector (matches the existing single-selector `StandingsControls`
 * pattern), not a per-group 1..max range. A continuation group's own rounds
 * naturally start above 1 (e.g. Mestaruussarja's own matches begin at round
 * 23) since round_id is never re-indexed per group.
 */
export function listSelectableTasoRounds(matchList: MatchRow[], competitionId: string): number[] {
  const allGroupIds = groupIdsIn(matchList);
  const rounds = matchList
    .filter(
      (match) =>
        match.matchday !== null && isOwnCalculated(competitionId, match.groupId, allGroupIds)
    )
    .map((match) => match.matchday as number);
  return [...new Set(rounds)].sort((left, right) => left - right);
}
