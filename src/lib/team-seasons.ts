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

/** One competition a club played in one season, and how much of it. */
export type TeamSeason = { competitionCode: string; seasonId: number; matches: number };

export type TeamSeasonsResult =
  | { status: "ok"; seasons: TeamSeason[] }
  /** No stored match at all under this route — the same bar specs/020 uses. */
  | { status: "not_found" }
  | { status: "error" };

/**
 * Every competition and season a club has stored matches for, newest first.
 *
 * A club's seasons are spread across tiers — promotion and relegation are
 * ordinary — while a team page's season selector offered the *competition's*
 * seasons. Measured 2026-09-02: 120 of the 264 (club, season) options on
 * Veikkausliiga's team pages ended at "Joukkuetta ei löytynyt.", and 28 of 108
 * on the Premier League's. This is what lets the selector offer the seasons the
 * club actually played, and lets a page that finds nothing say where it did
 * play instead. See specs/022-teams-between-tiers.md.
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

async function footballDataSeasons(
  region: CompetitionRegion,
  teamProviderId: number
): Promise<TeamSeasonsResult> {
  const codes = competitionsInRegion(region).map((competition) => competition.code);
  const scope = and(
    or(
      eq(matches.homeTeamProviderId, teamProviderId),
      eq(matches.awayTeamProviderId, teamProviderId)
    ),
    inArray(matches.competitionCode, codes)
  );

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
  const scope = and(
    or(
      eq(tasoMatches.homeTeamProviderId, teamProviderId),
      eq(tasoMatches.awayTeamProviderId, teamProviderId)
    ),
    notLike(tasoMatches.competitionCode, `${NATIONAL_TEAM_COMPETITION_PREFIX}%`),
    inArray(tasoMatches.categoryId, allDomesticCategoryIds())
  );

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

/** The club's current name: the one its newest stored match calls it. */
function nameOf(
  row: { homeTeamProviderId: number; homeTeamName: string; awayTeamName: string } | undefined,
  teamProviderId: number
): string | null {
  if (row === undefined) return null;
  return row.homeTeamProviderId === teamProviderId ? row.homeTeamName : row.awayTeamName;
}

/**
 * What to call a club whose page has no matches to take a name from.
 *
 * A separate question from its seasons, and a rarer one: a page that renders
 * matches reads the name off the first of them, so this only runs on the
 * "played elsewhere" path. Keeping it out of `getTeamSeasons` is what leaves
 * the common page at one added query rather than two.
 */
const loadTeamName = cache(async function loadTeamName(
  kind: TeamPageSource["kind"],
  scope: string,
  teamProviderId: number
): Promise<string | null> {
  try {
    if (kind === "football-data") {
      const codes = competitionsInRegion(scope as CompetitionRegion).map(
        (competition) => competition.code
      );
      const [row] = await db
        .select({
          homeTeamProviderId: matches.homeTeamProviderId,
          homeTeamName: matches.homeTeamName,
          awayTeamName: matches.awayTeamName,
        })
        .from(matches)
        .where(
          and(
            or(
              eq(matches.homeTeamProviderId, teamProviderId),
              eq(matches.awayTeamProviderId, teamProviderId)
            ),
            inArray(matches.competitionCode, codes)
          )
        )
        .orderBy(desc(matches.kickoffAt), desc(matches.providerMatchId))
        .limit(1);
      return nameOf(row, teamProviderId);
    }

    const [row] = await db
      .select({
        homeTeamProviderId: tasoMatches.homeTeamProviderId,
        homeTeamName: tasoMatches.homeTeamName,
        awayTeamName: tasoMatches.awayTeamName,
      })
      .from(tasoMatches)
      .where(
        and(
          or(
            eq(tasoMatches.homeTeamProviderId, teamProviderId),
            eq(tasoMatches.awayTeamProviderId, teamProviderId)
          ),
          notLike(tasoMatches.competitionCode, `${NATIONAL_TEAM_COMPETITION_PREFIX}%`),
          inArray(tasoMatches.categoryId, allDomesticCategoryIds())
        )
      )
      .orderBy(desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId))
      .limit(1);
    return nameOf(row, teamProviderId);
  } catch (error) {
    logger.error({ err: error, kind, scope, teamProviderId }, "Unable to read a team's name");
    return null;
  }
});

export function getTeamName(
  source: TeamPageSource,
  teamProviderId: number
): Promise<string | null> {
  if (!isStoredInteger(teamProviderId) || teamProviderId === PLACEHOLDER_TEAM_ID) {
    return Promise.resolve(null);
  }
  const scope = source.kind === "football-data" ? source.region : source.bucket;
  return loadTeamName(source.kind, scope, teamProviderId);
}

/** Newest season first, and within a season the competition with the most matches. */
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
 *
 * A 27-game league beats a 2-game cup run, so the reader lands where the club
 * actually spent the year. Read from stored rows rather than from a ranking of
 * tiers, which the data does not carry. `sortSeasons` has already ordered them.
 */
export function competitionForSeason(seasons: TeamSeason[], seasonId: number): string | null {
  return seasons.find((season) => season.seasonId === seasonId)?.competitionCode ?? null;
}

/** What a team page needs from a club's seasons, once labels are applied. */
export type TeamSeasonsView = {
  /** The seasons the club played, newest first, for the selector. */
  offeredSeasons: Array<{ seasonId: number; label: string }>;
  /** Where the club played in the season being shown, most matches first. */
  sameSeason: Array<{ label: string; href: string }>;
  /** The club's most recent season, offered when it played nothing this one. */
  newest: { label: string; href: string } | null;
};

/**
 * The same three answers both team pages need, derived once.
 *
 * The pages differ only in how they label a season and name a competition —
 * `2026` against `2025/26`, the domestic registry against the football-data
 * one — so those come in as functions and everything else is shared.
 */
export function teamSeasonsView(
  seasons: TeamSeason[],
  seasonId: number,
  labels: {
    season: (seasonId: number) => string;
    competition: (competitionCode: string) => string;
    href: (competitionCode: string, seasonId: number) => string;
  }
): TeamSeasonsView {
  const offeredSeasons = [...new Set(seasons.map((entry) => entry.seasonId))]
    .sort((left, right) => right - left)
    .map((year) => ({ seasonId: year, label: labels.season(year) }));

  const sameSeason = competitionsInSeason(seasons, seasonId).map((entry) => ({
    label: labels.competition(entry.competitionCode),
    href: labels.href(entry.competitionCode, entry.seasonId),
  }));

  const [mostRecent] = seasons;
  const newest =
    mostRecent === undefined
      ? null
      : {
          label: `${labels.competition(mostRecent.competitionCode)} ${labels.season(mostRecent.seasonId)}`,
          href: labels.href(mostRecent.competitionCode, mostRecent.seasonId),
        };

  return { offeredSeasons, sameSeason, newest };
}

/** Every competition a club played in one season, most matches first. */
export function competitionsInSeason(seasons: TeamSeason[], seasonId: number): TeamSeason[] {
  return seasons.filter((season) => season.seasonId === seasonId);
}

/** Season → the competition the selector should land on, for every season the club played. */
export function seasonCompetitions(seasons: TeamSeason[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (const season of seasons) {
    map[season.seasonId] ??= season.competitionCode;
  }
  return map;
}
