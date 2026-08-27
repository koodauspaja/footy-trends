import { logger } from "./logger";
import {
  groupByPlayedYear,
  isFinlandMatch,
  MENS_TEAM_ACTIVE_YEAR,
  MENS_TEAM_SEASONS,
  mensTeamCategories,
} from "./mens-team";
import type { NormalizedTasoMatch } from "./taso";
import { getSeasonCategoryNameMap, getSeasonMatchList } from "./taso-standings-service";

/** A match plus the name of the competition it belonged to, which the row shows. */
export type MensTeamMatch = NormalizedTasoMatch & { competitionName: string };

/** One calendar year's matches, chronological. Only years with matches become sections. */
export type MensTeamYear = { year: number; matches: MensTeamMatch[] };

export type MensTeamResult =
  | { status: "ok"; years: MensTeamYear[] }
  | { status: "empty" }
  | { status: "error" };

/**
 * One provider bucket's Finland matches, or `null` if any part of it failed.
 *
 * `null` rather than an empty list precisely because the two must not be
 * confused: an empty category is normal (2025's `UNL` exists and holds no
 * matches), while a failed one has to reach the reader as an error. A year
 * quietly missing from a page that shows all of them is invisible — nothing on
 * screen would say which one went absent.
 *
 * The returned matches are not yet grouped: which year each belongs to is
 * decided by its own date, not by this bucket's nominal season.
 */
async function loadSeason(
  seasonId: number,
  competitionId: string
): Promise<MensTeamMatch[] | null> {
  let categoryNames: Record<string, string>;
  try {
    categoryNames = await getSeasonCategoryNameMap(competitionId, seasonId, MENS_TEAM_ACTIVE_YEAR);
  } catch (error) {
    logger.error(
      { err: error, seasonId, competitionId },
      "Unable to read national-team categories"
    );
    return null;
  }

  const categories = mensTeamCategories(categoryNames);
  const results = await Promise.all(
    categories.map(async (category) => ({
      ...category,
      result: await getSeasonMatchList(
        category.categoryId,
        competitionId,
        seasonId,
        MENS_TEAM_ACTIVE_YEAR
      ),
    }))
  );

  const matches: MensTeamMatch[] = [];
  for (const { categoryId, competitionName, result } of results) {
    // "empty" is a category with no matches, which is ordinary. Only "error"
    // means the season cannot be shown truthfully.
    if (result.status === "error") {
      logger.error(
        { seasonId, competitionId, categoryId },
        "Unable to load a national-team category"
      );
      return null;
    }
    if (result.status !== "ok") continue;

    for (const match of result.matches) {
      if (isFinlandMatch(match)) matches.push({ ...match, competitionName });
    }
  }

  return matches;
}

/**
 * Every year on the page, newest first, each one's matches chronological.
 *
 * Buckets load in parallel and are then regrouped by the year each match was
 * actually played in, because a bucket is not a calendar year — `maajp18`
 * holds matches from 2019, 2020 and 2021.
 *
 * Any single failure fails the whole page, for the reason given on
 * `loadSeason`.
 */
export async function getMensTeamYears(): Promise<MensTeamResult> {
  const loaded = await Promise.all(
    MENS_TEAM_SEASONS.map(({ year, competitionId }) => loadSeason(year, competitionId))
  );
  const matches: MensTeamMatch[] = [];
  for (const seasonMatches of loaded) {
    if (seasonMatches === null) return { status: "error" };
    matches.push(...seasonMatches);
  }

  const years = groupByPlayedYear(matches);

  return years.length === 0 ? { status: "empty" } : { status: "ok", years };
}
