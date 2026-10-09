import { toFinnishTasoTeamNames } from "./country-names";
import { logger } from "./logger";
import {
  groupByPlayedYear,
  isFinlandMatch,
  NATIONAL_TEAM_ACTIVE_YEAR,
  NATIONAL_TEAM_SEASONS,
  type NationalTeam,
  nationalTeamCategories,
  normalizeFinlandId,
} from "./national-team";
import type { NormalizedTasoMatch } from "./taso";
import { getSeasonCategoryNameMap, getSeasonMatchList } from "./taso-standings-service";

/**
 * A match plus the name of the competition it belonged to, which the row shows.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export type NationalTeamMatch = NormalizedTasoMatch & { competitionName: string };

/**
 * One calendar year's matches, chronological. Only years with matches become sections.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export type NationalTeamYear = { year: number; matches: NationalTeamMatch[] };

export type NationalTeamResult =
  /** `incomplete` when some buckets loaded and others failed. */
  | { status: "ok"; years: NationalTeamYear[]; incomplete: boolean }
  | { status: "empty" }
  | { status: "error" };

/**
 * One provider bucket's Finland matches, not yet grouped by year, or `null` if
 * the bucket cannot be served at all. An empty list is a normal answer.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 * decisions/041-national-team-analytics.md
 */
async function loadSeason(
  team: NationalTeam,
  seasonId: number,
  competitionId: string
): Promise<NationalTeamMatch[] | null> {
  let categoryNames: Record<string, string>;
  try {
    categoryNames = await getSeasonCategoryNameMap(
      competitionId,
      seasonId,
      NATIONAL_TEAM_ACTIVE_YEAR
    );
  } catch (error) {
    logger.error(
      { err: error, seasonId, competitionId },
      "Unable to read national-team categories"
    );
    return null;
  }

  const categories = nationalTeamCategories(team, categoryNames);
  const results = await Promise.all(
    categories.map(async (category) => ({
      ...category,
      result: await getSeasonMatchList(
        category.categoryId,
        competitionId,
        seasonId,
        NATIONAL_TEAM_ACTIVE_YEAR
      ),
    }))
  );

  const matches: NationalTeamMatch[] = [];
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

    // Names are normalised before the filter, not after, so a row can never be
    // matched on one spelling and displayed as another.
    for (const match of toFinnishTasoTeamNames(result.matches)) {
      // `normalizeFinlandId` runs here and nowhere else: this is the one place that
      // has already worked out which side Finland is.
      if (isFinlandMatch(match)) {
        matches.push({ ...normalizeFinlandId(match), competitionName });
      }
    }
  }

  return matches;
}

/**
 * Every year on one team's page, newest first, each one's matches
 * chronological. A bucket that fails is left out and `incomplete` says so;
 * only a page with nothing to show is an error.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
export async function getNationalTeamYears(team: NationalTeam): Promise<NationalTeamResult> {
  const loaded = await Promise.all(
    NATIONAL_TEAM_SEASONS.map(({ year, competitionId }) => loadSeason(team, year, competitionId))
  );

  const succeeded = loaded.filter((matches): matches is NationalTeamMatch[] => matches !== null);
  const failedCount = loaded.length - succeeded.length;
  const years = groupByPlayedYear(succeeded.flat());

  if (years.length > 0) return { status: "ok", years, incomplete: failedCount > 0 };

  // Nothing to show. "Empty" only when that is the truth rather than the
  // consequence of a failure — otherwise the reader would be told there are no
  // matches when there are, and we simply could not read them.
  return failedCount === 0 ? { status: "empty" } : { status: "error" };
}
