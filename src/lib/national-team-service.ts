import { toFinnishTasoTeamNames } from "./country-names";
import { logger } from "./logger";
import {
  groupByPlayedYear,
  isFinlandMatch,
  NATIONAL_TEAM_ACTIVE_YEAR,
  NATIONAL_TEAM_SEASONS,
  type NationalTeam,
  nationalTeamCategories,
} from "./national-team";
import type { NormalizedTasoMatch } from "./taso";
import { getSeasonCategoryNameMap, getSeasonMatchList } from "./taso-standings-service";

/** A match plus the name of the competition it belonged to, which the row shows. */
export type NationalTeamMatch = NormalizedTasoMatch & { competitionName: string };

/** One calendar year's matches, chronological. Only years with matches become sections. */
export type NationalTeamYear = { year: number; matches: NationalTeamMatch[] };

export type NationalTeamResult =
  /** `incomplete` when some buckets loaded and others failed. */
  | { status: "ok"; years: NationalTeamYear[]; incomplete: boolean }
  | { status: "empty" }
  | { status: "error" };

/**
 * One provider bucket's Finland matches, or `null` if the bucket cannot be
 * served at all.
 *
 * `null` rather than an empty list precisely because the two must not be
 * confused: an empty category is normal — thirteen of Helmarit's return no
 * rows at all, and two more hold only other teams' matches — while a category
 * that cannot be read has to reach the reader as an error. A year quietly missing from a page that shows all of them is
 * invisible — nothing on screen would say which one went absent.
 *
 * "Cannot be served at all" is the exact bar, and it is lower than it sounds.
 * `getSeasonMatchList` answers `ok` with stored rows when a refresh fails, so
 * a TASO outage serves the database's copy rather than an error, and only a
 * category with nothing stored *and* a failed refresh reaches `null`. That is
 * the app-wide behaviour and it is right here: every year but the current one
 * is a finished season whose stored rows are complete, so "stale" has no
 * meaning for them. Only the current year can lag, by one refresh interval.
 *
 * The returned matches are not yet grouped: which year each belongs to is
 * decided by its own date, not by this bucket's nominal season.
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
      if (isFinlandMatch(match)) matches.push({ ...match, competitionName });
    }
  }

  return matches;
}

/**
 * Every year on one team's page, newest first, each one's matches
 * chronological.
 *
 * Buckets load in parallel and are then regrouped by the year each match was
 * actually played in, because a bucket is not a calendar year — `maajp18`
 * holds three years of Huuhkajat matches and four of Helmarit's.
 *
 * A bucket that fails no longer takes the page with it. The first version
 * failed the whole page on any failure, reasoning that a year missing from a
 * page showing every year leaves no gap a reader could notice. Production
 * proved the trade wrong: this page issues up to 28 queries where every other
 * issues one, so a single transient failure blanked eight years of history
 * (#180).
 *
 * What loaded is rendered, and `incomplete` tells the page to say so — which
 * has no silent hole either. Only a page with nothing to show at all is an
 * error.
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
