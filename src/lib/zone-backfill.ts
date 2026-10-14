/**
 * The one-off backfill of zone levels: every stored season of the competitions
 * that show zones is asked for its groups again, and only the levels are
 * written. The team rows of a season that is never refetched stay as stored.
 *
 * decisions/063-competition-zones.md
 */

import {
  categoryIdForSeason,
  competitionIdForSeason,
  ZONE_COMPETITION_CODES,
} from "./domestic-competitions";
import { logger } from "./logger";
import type { Paced } from "./pacer";
import { getSeasonGroups, normalizeGroupLevels } from "./taso";
import { storedTasoSeasons, synchronizeGroupLevels } from "./taso-standings-service";

/**
 * One TASO request every three seconds: slower than the full backfill's pace,
 * since this run is one-off and has no deadline.
 */
export const ZONE_BACKFILL_PER_MINUTE = 20;

export type ZoneBackfillResult = {
  /** Seasons whose levels were stored. */
  written: number;
  /** Seasons TASO answered for with no level to store. */
  skipped: number;
  /** Seasons that could not be read, as `VL 2025`; a re-run asks them again. */
  failed: string[];
};

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the backfill and says what it did, one line a season through `report`
 * and one log line at the end. A season that cannot be read is reported and
 * left as it was.
 */
export async function backfillZones(
  pace: Paced,
  report: (line: string) => void
): Promise<ZoneBackfillResult> {
  const result: ZoneBackfillResult = { written: 0, skipped: 0, failed: [] };

  for (const code of ZONE_COMPETITION_CODES) {
    const seasons = [...(await storedTasoSeasons(code))].sort((left, right) => right - left);
    for (const seasonId of seasons) {
      const competitionId = competitionIdForSeason(code, seasonId);
      const categoryId = categoryIdForSeason(code, seasonId);
      try {
        const groups = await pace(() => getSeasonGroups(competitionId, categoryId));
        // No groups is not an answer about a season we hold rows for.
        if (groups.length === 0) throw new Error("TASO returned no groups");

        const levels = normalizeGroupLevels(groups, categoryId, competitionId, seasonId);
        await synchronizeGroupLevels(categoryId, competitionId, seasonId, levels);
        if (levels.length === 0) {
          result.skipped += 1;
          report(`  ${code} ${seasonId}: no levels published, skipped`);
        } else {
          result.written += 1;
          report(`  ${code} ${seasonId}: ${levels.length} levels`);
        }
      } catch (error) {
        result.failed.push(`${code} ${seasonId}`);
        report(`  ${code} ${seasonId}: FAILED — ${reasonOf(error)}`);
      }
    }
  }

  logger.info(
    { written: result.written, skipped: result.skipped, failed: result.failed },
    "Zone backfill finished"
  );
  return result;
}
