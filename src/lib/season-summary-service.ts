/**
 * The `Kausi lyhyesti` block's one read path for both providers: each passes
 * its own season reader and records, and the upset is read here.
 *
 * decisions/066-season-summary.md
 */
import { logger } from "./logger";
import type { MatchSource } from "./match-source";
import type { SeasonKey } from "./season-comparison";
import { type SeasonSummarySeries, type SummaryReaders, seasonSummaryFor } from "./season-summary";
import { getTeamUpset } from "./surprise-service";

/**
 * The block for one club and season, or `error` with one line logged when a
 * detector or a read it makes throws.
 *
 * decisions/066-season-summary.md
 */
export async function getSeasonSummary<T extends SeasonKey>(
  source: MatchSource["kind"],
  readers: Omit<SummaryReaders<T>, "upset">
): Promise<SeasonSummarySeries> {
  const { teamId, selected } = readers;
  try {
    return await seasonSummaryFor({
      ...readers,
      upset: () => getTeamUpset(source, selected.competitionCode, selected.seasonId, teamId),
    });
  } catch (error) {
    logger.error(
      {
        source,
        teamProviderId: teamId,
        competitionCode: selected.competitionCode,
        seasonId: selected.seasonId,
        err: error,
      },
      "Unable to summarise the season"
    );
    return { status: "error" };
  }
}
