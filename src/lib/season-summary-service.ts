/**
 * The `Kausi lyhyesti` block's one read path for both providers: each passes
 * its own season reader and records, and the upset is read here.
 *
 * decisions/066-season-summary.md
 */
import { logger } from "./logger";
import type { MatchSource } from "./match-source";
import type { SeasonKey, SeasonReadResult } from "./season-comparison";
import { type SeasonSummarySeries, type SummaryReaders, seasonSummaryFor } from "./season-summary";
import type { StreakRecordsSeries } from "./streak-records";
import { getTeamUpset } from "./surprise-service";
import type { TeamSeason } from "./team-seasons";

/**
 * The block for one club and season, or `error` with one line logged, whether a
 * read failed or a detector or a read threw.
 *
 * decisions/066-season-summary.md
 */
export async function getSeasonSummary<T extends SeasonKey>(
  source: MatchSource["kind"],
  readers: Omit<SummaryReaders<T>, "upset">
): Promise<SeasonSummarySeries> {
  const { teamId, selected } = readers;
  let series: SeasonSummarySeries = { status: "error" };
  // The error itself when one was thrown; a read that reports failure has none.
  let thrown: { err?: unknown } = {};
  try {
    series = await seasonSummaryFor({
      ...readers,
      upset: () => getTeamUpset(source, selected.competitionCode, selected.seasonId, teamId),
    });
  } catch (error) {
    thrown = { err: error };
  }
  if (series.status === "error") {
    logger.error(
      {
        source,
        teamProviderId: teamId,
        competitionCode: selected.competitionCode,
        seasonId: selected.seasonId,
        ...thrown,
      },
      "Unable to summarise the season"
    );
  }
  return series;
}

/**
 * What a provider supplies: which competitions are leagues, how one of its
 * seasons is read, and `Ennätykset`'s own records.
 *
 * decisions/066-season-summary.md
 */
export type SummaryProvider = {
  isLeague: (competitionCode: string) => boolean;
  read: (
    key: SeasonKey,
    activeSeasonId: number,
    teamProviderId: number
  ) => Promise<SeasonReadResult>;
  records: (
    competitionCode: string,
    teamProviderId: number,
    activeSeasonId: number,
    seasons: readonly TeamSeason[],
    label: (seasonId: number) => string
  ) => Promise<StreakRecordsSeries>;
};

/**
 * A provider's `getTeamSeasonSummary`, over the same reads as `Tämä kausi
 * verrattuna` and the same records as `Ennätykset`.
 *
 * decisions/066-season-summary.md
 */
export function teamSeasonSummary(source: MatchSource["kind"], provider: SummaryProvider) {
  return (
    competitionCode: string,
    teamProviderId: number,
    seasonId: number,
    activeSeasonId: number,
    seasons: readonly TeamSeason[] | null,
    label: (seasonId: number) => string
  ): Promise<SeasonSummarySeries> =>
    getSeasonSummary(source, {
      teamId: teamProviderId,
      selected: { competitionCode, seasonId },
      activeSeasonId,
      seasons,
      isLeague: provider.isLeague,
      label,
      read: (key) => provider.read(key, activeSeasonId, teamProviderId),
      records: (stored) =>
        provider.records(competitionCode, teamProviderId, activeSeasonId, stored, label),
    });
}
