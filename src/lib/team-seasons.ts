/**
 * The competitions and seasons a club has stored matches in, for a team page
 * whose club moves between tiers.
 *
 * decisions/022-teams-between-tiers.md
 */

import { and, desc, eq, inArray, notLike, or, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { type CompetitionRegion, competitionsInRegion } from "./competitions";
import { allDomesticCategoryIds, competitionCodeForCategory } from "./domestic-competitions";
import { logger } from "./logger";
import { PLACEHOLDER_TEAM_ID } from "./match-detail";
import { NATIONAL_TEAM_COMPETITION_PREFIX } from "./match-source";
import { isStoredInteger } from "./provider-ids";
import type { TeamPageSource } from "./team-context";

/**
 * One competition a club played in one season, and how much of it.
 *
 * decisions/022-teams-between-tiers.md
 */
export type TeamSeason = { competitionCode: string; seasonId: number; matches: number };

export type TeamSeasonsResult =
  | { status: "ok"; seasons: TeamSeason[] }
  /** No stored match at all under this route. */
  | { status: "not_found" }
  | { status: "error" };

/**
 * Every competition and season a club has stored matches for, newest first.
 *
 * decisions/022-teams-between-tiers.md
 */
const loadTeamSeasons = cache(async function loadTeamSeasons(
  kind: TeamPageSource["kind"],
  scope: string,
  teamProviderId: number
): Promise<TeamSeasonsResult> {
  try {
    return kind === "football-data"
      ? await footballDataSeasons(scope as CompetitionRegion, teamProviderId)
      : await tasoSeasons(teamProviderId);
  } catch (error) {
    logger.error({ err: error, kind, scope, teamProviderId }, "Unable to read a team's seasons");
    return { status: "error" };
  }
});

/**
 * Which rows belong to a club under one route. Written once, for both reads
 * below.
 *
 * decisions/022-teams-between-tiers.md
 */
function footballDataScope(region: CompetitionRegion, teamProviderId: number) {
  const codes = competitionsInRegion(region).map((competition) => competition.code);
  return and(
    or(
      eq(matches.homeTeamProviderId, teamProviderId),
      eq(matches.awayTeamProviderId, teamProviderId)
    ),
    inArray(matches.competitionCode, codes)
  );
}

function tasoScope(teamProviderId: number) {
  return and(
    or(
      eq(tasoMatches.homeTeamProviderId, teamProviderId),
      eq(tasoMatches.awayTeamProviderId, teamProviderId)
    ),
    // The national-team buckets share this table and have no team pages.
    notLike(tasoMatches.competitionCode, `${NATIONAL_TEAM_COMPETITION_PREFIX}%`),
    // Only categories the picker claims: a row the site cannot show a page for
    // cannot answer which page this should be.
    inArray(tasoMatches.categoryId, allDomesticCategoryIds())
  );
}

async function footballDataSeasons(
  region: CompetitionRegion,
  teamProviderId: number
): Promise<TeamSeasonsResult> {
  const scope = footballDataScope(region, teamProviderId);

  const rows = await db
    .select({
      competitionCode: matches.competitionCode,
      seasonId: matches.seasonId,
      matches: sql<number>`count(*)::int`,
    })
    .from(matches)
    .where(scope)
    .groupBy(matches.competitionCode, matches.seasonId);

  if (rows.length === 0) return { status: "not_found" };

  return { status: "ok", seasons: sortSeasons(rows) };
}

async function tasoSeasons(teamProviderId: number): Promise<TeamSeasonsResult> {
  const scope = tasoScope(teamProviderId);

  const rows = await db
    .select({
      categoryId: tasoMatches.categoryId,
      seasonId: tasoMatches.seasonId,
      matches: sql<number>`count(*)::int`,
    })
    .from(tasoMatches)
    .where(scope)
    .groupBy(tasoMatches.categoryId, tasoMatches.seasonId);

  // A competition outlives its own `category_id`, so two eras can land in one
  // season; their matches belong to the same competition and are counted once.
  const byCompetition = new Map<string, TeamSeason>();
  for (const row of rows) {
    const competitionCode = competitionCodeForCategory(row.categoryId);
    if (competitionCode === null) continue;
    const key = `${competitionCode}:${row.seasonId}`;
    const existing = byCompetition.get(key);
    if (existing === undefined) {
      byCompetition.set(key, { competitionCode, seasonId: row.seasonId, matches: row.matches });
    } else {
      existing.matches += row.matches;
    }
  }

  if (byCompetition.size === 0) return { status: "not_found" };

  return { status: "ok", seasons: sortSeasons([...byCompetition.values()]) };
}

/**
 * What to call a club whose page has no matches to take a name from. `error`
 * is not `not_found`: a database that could not answer is not a nameless club.
 *
 * decisions/022-teams-between-tiers.md
 */
export type TeamNameResult =
  | { status: "ok"; name: string }
  | { status: "not_found" }
  | { status: "error" };

const loadTeamName = cache(async function loadTeamName(
  kind: TeamPageSource["kind"],
  scope: string,
  teamProviderId: number
): Promise<TeamNameResult> {
  try {
    const row =
      kind === "football-data"
        ? await db
            .select({
              homeTeamProviderId: matches.homeTeamProviderId,
              homeTeamName: matches.homeTeamName,
              awayTeamName: matches.awayTeamName,
            })
            .from(matches)
            .where(footballDataScope(scope as CompetitionRegion, teamProviderId))
            .orderBy(desc(matches.kickoffAt), desc(matches.providerMatchId))
            .limit(1)
            .then(([first]) => first)
        : await db
            .select({
              homeTeamProviderId: tasoMatches.homeTeamProviderId,
              homeTeamName: tasoMatches.homeTeamName,
              awayTeamName: tasoMatches.awayTeamName,
            })
            .from(tasoMatches)
            .where(tasoScope(teamProviderId))
            .orderBy(desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId))
            .limit(1)
            .then(([first]) => first);

    if (row === undefined) return { status: "not_found" };
    return {
      status: "ok",
      name: row.homeTeamProviderId === teamProviderId ? row.homeTeamName : row.awayTeamName,
    };
  } catch (error) {
    logger.error({ err: error, kind, scope, teamProviderId }, "Unable to read a team's name");
    return { status: "error" };
  }
});

export function getTeamName(
  source: TeamPageSource,
  teamProviderId: number
): Promise<TeamNameResult> {
  if (!isStoredInteger(teamProviderId) || teamProviderId === PLACEHOLDER_TEAM_ID) {
    return Promise.resolve({ status: "not_found" });
  }
  const scope = source.kind === "football-data" ? source.region : source.bucket;
  return loadTeamName(source.kind, scope, teamProviderId);
}

/**
 * Newest season first, and within a season the competition with the most matches.
 *
 * decisions/022-teams-between-tiers.md
 */
function sortSeasons(seasons: TeamSeason[]): TeamSeason[] {
  return [...seasons].sort(
    (left, right) =>
      right.seasonId - left.seasonId ||
      right.matches - left.matches ||
      left.competitionCode.localeCompare(right.competitionCode)
  );
}

export function getTeamSeasons(
  source: TeamPageSource,
  teamProviderId: number
): Promise<TeamSeasonsResult> {
  if (!isStoredInteger(teamProviderId) || teamProviderId === PLACEHOLDER_TEAM_ID) {
    return Promise.resolve({ status: "not_found" });
  }
  const scope = source.kind === "football-data" ? source.region : source.bucket;
  return loadTeamSeasons(source.kind, scope, teamProviderId);
}

/**
 * Where a club played in one season: the competition with the most matches.
 * `sortSeasons` has already ordered them.
 *
 * decisions/022-teams-between-tiers.md
 */
export function competitionForSeason(seasons: TeamSeason[], seasonId: number): string | null {
  return seasons.find((season) => season.seasonId === seasonId)?.competitionCode ?? null;
}

/**
 * What a team page needs from a club's seasons, once labels are applied.
 *
 * decisions/022-teams-between-tiers.md
 */
export type TeamSeasonsView = {
  /** The seasons the club played, newest first, for the selector. */
  offeredSeasons: Array<{ seasonId: number; label: string }>;
  /**
   * Season to the competition the selector navigates to, from the same filtered
   * set as `offeredSeasons`.
   */
  seasonCompetitions: Record<number, string>;
  /** Where the club played in the season being shown, most matches first. */
  sameSeason: Array<{ label: string; href: string }>;
  /** The club's most recent season, offered when it played nothing this one. */
  newest: { label: string; href: string } | null;
};

/**
 * The three answers both team pages need, derived once. How a season is
 * labelled and a competition named comes in as functions.
 *
 * decisions/022-teams-between-tiers.md
 */
export function teamSeasonsView(
  seasons: TeamSeason[],
  seasonId: number,
  labels: {
    season: (seasonId: number) => string;
    competition: (competitionCode: string) => string;
    href: (competitionCode: string, seasonId: number) => string;
    /**
     * Whether a page exists for this competition and season.
     */
    selectable: (competitionCode: string, seasonId: number) => boolean;
  }
): TeamSeasonsView {
  const reachable = seasons.filter((entry) =>
    labels.selectable(entry.competitionCode, entry.seasonId)
  );
  // The season being shown is always offered, even when the club did not play
  // it, so the dropdown never has nothing selected and the list is never empty.
  const offeredSeasons = [...new Set([...reachable.map((entry) => entry.seasonId), seasonId])]
    .sort((left, right) => right - left)
    .map((year) => ({ seasonId: year, label: labels.season(year) }));

  const sameSeason = competitionsInSeason(reachable, seasonId).map((entry) => ({
    label: labels.competition(entry.competitionCode),
    href: labels.href(entry.competitionCode, entry.seasonId),
  }));

  const [mostRecent] = reachable;
  const newest =
    mostRecent === undefined
      ? null
      : {
          label: `${labels.competition(mostRecent.competitionCode)} ${labels.season(mostRecent.seasonId)}`,
          href: labels.href(mostRecent.competitionCode, mostRecent.seasonId),
        };

  return {
    offeredSeasons,
    seasonCompetitions: seasonCompetitions(reachable),
    sameSeason,
    newest,
  };
}

/**
 * Every competition a club played in one season, most matches first.
 *
 * decisions/022-teams-between-tiers.md
 */
export function competitionsInSeason(seasons: TeamSeason[], seasonId: number): TeamSeason[] {
  return seasons.filter((season) => season.seasonId === seasonId);
}

/**
 * Season to the competition the selector should land on, for every season the club played.
 *
 * decisions/022-teams-between-tiers.md
 */
function seasonCompetitions(seasons: TeamSeason[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (const season of seasons) {
    map[season.seasonId] ??= season.competitionCode;
  }
  return map;
}
