/**
 * Which TASO seasons exist: those stored, the current one, the range a page
 * offers, and a season's category name.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/816-split-by-job.md
 */

import { and, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { tasoGroupTeams, tasoMatches } from "@/db/schema";
import { logger } from "../platform/logger";
import { getCached, getCachedUnlessDegraded } from "../providers/cache";
import {
  categoryIdForSeason,
  categoryIdsFor,
  competitionIdForSeason,
  earliestSeasonFor,
} from "./domestic-competitions";
import {
  EARLIEST_TASO_SEASON,
  getCurrentSeason,
  getSeasonCategoryNames,
  tasoCategoryNamesCacheKey,
} from "./taso";
import { CURRENT_SEASON_CACHE_TTL_SECONDS, getSyncedSeasonMatches } from "./taso-sync";

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
 * Every side in a competition's stored season, home or away, as stored: no
 * refresh, so reading another competition's sides asks TASO nothing.
 *
 * decisions/067-knockout-simulation.md
 */
export async function storedSeasonSides(code: string, seasonId: number): Promise<Set<number>> {
  const season = and(
    eq(tasoMatches.categoryId, categoryIdForSeason(code, seasonId)),
    eq(tasoMatches.competitionCode, competitionIdForSeason(code, seasonId)),
    eq(tasoMatches.seasonId, seasonId)
  );
  // One query, so a sync committing between two reads cannot split the sides.
  const pairings = await db
    .selectDistinct({ home: tasoMatches.homeTeamProviderId, away: tasoMatches.awayTeamProviderId })
    .from(tasoMatches)
    .where(season);
  return new Set(pairings.flatMap((pairing) => [pairing.home, pairing.away]));
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
      tasoCategoryNamesCacheKey(competitionId),
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
  return getCached<Record<string, string>>(tasoCategoryNamesCacheKey(competitionId), ttl, () =>
    getSeasonCategoryNames(competitionId)
  );
}
