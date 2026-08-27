import { cache } from "react";
import {
  byKickoffThenId,
  HUUHKAJAT_ACTIVE_YEAR,
  HUUHKAJAT_SEASONS,
  huuhkajatCategories,
  isFinlandMatch,
} from "./huuhkajat";
import { logger } from "./logger";
import type { NormalizedTasoMatch } from "./taso";
import { getSeasonCategoryNameMap, getSeasonMatchList } from "./taso-standings-service";

/** A match plus the name of the competition it belonged to, which the row shows. */
export type HuuhkajatMatch = NormalizedTasoMatch & { competitionName: string };

/** One year's matches, chronological. Only years with matches become sections. */
export type HuuhkajatYear = { year: number; matches: HuuhkajatMatch[] };

export type HuuhkajatResult =
  | { status: "ok"; years: HuuhkajatYear[] }
  | { status: "empty" }
  | { status: "error" };

/**
 * One year's Huuhkajat matches, or `null` if any part of the year failed.
 *
 * `null` rather than an empty list precisely because the two must not be
 * confused: an empty year is normal (2025's `UNL` category exists and holds no
 * matches), while a failed one has to reach the reader as an error. A year
 * quietly missing from a page that shows all of them is invisible — nothing on
 * screen would say which one went absent.
 */
async function loadYear(year: number, competitionId: string): Promise<HuuhkajatYear | null> {
  let categoryNames: Record<string, string>;
  try {
    categoryNames = await getSeasonCategoryNameMap(competitionId, year, HUUHKAJAT_ACTIVE_YEAR);
  } catch (error) {
    logger.error({ err: error, year, competitionId }, "Unable to read Huuhkajat categories");
    return null;
  }

  const categories = huuhkajatCategories(categoryNames);
  const results = await Promise.all(
    categories.map(async (category) => ({
      ...category,
      result: await getSeasonMatchList(
        category.categoryId,
        competitionId,
        year,
        HUUHKAJAT_ACTIVE_YEAR
      ),
    }))
  );

  const matches: HuuhkajatMatch[] = [];
  for (const { categoryId, competitionName, result } of results) {
    // "empty" is a category with no matches, which is ordinary. Only "error"
    // means the year cannot be shown truthfully.
    if (result.status === "error") {
      logger.error({ year, competitionId, categoryId }, "Unable to load a Huuhkajat category");
      return null;
    }
    if (result.status !== "ok") continue;

    for (const match of result.matches) {
      if (isFinlandMatch(match)) matches.push({ ...match, competitionName });
    }
  }

  return { year, matches: matches.sort(byKickoffThenId) };
}

/**
 * Every year on the page, newest first, each one's matches chronological.
 *
 * Years load in parallel; any single failure fails the whole page, for the
 * reason given on `loadYear`. Wrapped in React's `cache()` so `generateMetadata`
 * and the page body share one pass per request.
 */
export const getHuuhkajatYears = cache(async (): Promise<HuuhkajatResult> => {
  const loaded = await Promise.all(
    HUUHKAJAT_SEASONS.map(({ year, competitionId }) => loadYear(year, competitionId))
  );
  if (loaded.some((year) => year === null)) return { status: "error" };

  const years = loaded
    .filter((year): year is HuuhkajatYear => year !== null)
    .filter((year) => year.matches.length > 0);

  return years.length === 0 ? { status: "empty" } : { status: "ok", years };
});
