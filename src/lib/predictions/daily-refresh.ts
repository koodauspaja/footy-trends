/**
 * Once a day, every competition's current season fetched and stored, so the
 * readers of stored rows see fixtures and results no page visit fetched.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */

import { SUPPORTED_COMPETITIONS } from "../competitions/competitions";
import {
  getSeasonMatches as getFootballDataSeasonMatches,
  getSeasonContext,
} from "../football-data/football-data";
import { synchronizeMatches as synchronizeFootballDataMatches } from "../football-data/standings-service";
import type { MatchSource } from "../matches/match-source";
import { logger } from "../platform/logger";
import { type Paced, type ProviderPacers, providerPacers } from "../providers/pacer";
import {
  categoryIdForSeason,
  competitionIdForSeason,
  DOMESTIC_COMPETITIONS,
} from "../taso/domestic-competitions";
import { getSeasonGroups, getSeasonMatches as getTasoSeasonMatches } from "../taso/taso";
import { resolveTasoSeasonCeiling } from "../taso/taso-seasons";
import { storeSeasonGroups, synchronizeMatches as synchronizeTasoMatches } from "../taso/taso-sync";

/**
 * The hour, in UTC, whose hourly run refreshes every competition first.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */
export const DAILY_REFRESH_HOUR_UTC = 3;

/**
 * Whether a run started at this moment is the day's one with the refresh.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */
export function isDailyRefreshHour(at: Date): boolean {
  return at.getUTCHours() === DAILY_REFRESH_HOUR_UTC;
}

/**
 * The football-data competitions refreshed: the foreign leagues and cups. The
 * national teams' tournaments are read only by their own pages.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */
export const DAILY_FOOTBALL_DATA_CODES: readonly string[] = SUPPORTED_COMPETITIONS.filter(
  (competition) => competition.region === "foreign"
).map((competition) => competition.code);

/**
 * What one daily refresh did.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */
export type DailyRefreshReport = {
  /** Competition-seasons fetched and stored. */
  refreshed: number;
  /** One line per competition-season, or season discovery, that failed. */
  failures: string[];
};

function failure(
  source: MatchSource["kind"],
  code: string,
  seasonId: number | null,
  error: unknown
): string {
  logger.error({ err: error, source, code, seasonId }, "Daily refresh of a competition failed");
  return `daily ${source} ${code} ${seasonId ?? "season"}`;
}

async function refreshDomestic(code: string, paced: Paced): Promise<DailyRefreshReport> {
  let ceiling: Awaited<ReturnType<typeof resolveTasoSeasonCeiling>>;
  try {
    ceiling = await paced(() => resolveTasoSeasonCeiling(code));
  } catch (error) {
    return { refreshed: 0, failures: [failure("taso", code, null, error)] };
  }
  // A failed discovery still refreshes the season it fell back to, as a page does.
  const failures = ceiling.discoveryFailed
    ? [failure("taso", code, null, new Error("TASO season discovery failed"))]
    : [];
  const seasonId = ceiling.currentSeason;
  const categoryId = categoryIdForSeason(code, seasonId);
  const competitionId = competitionIdForSeason(code, seasonId);
  try {
    const matches = await paced(() => getTasoSeasonMatches(competitionId, categoryId, seasonId));
    await synchronizeTasoMatches(matches);
    const groups = await paced(() => getSeasonGroups(competitionId, categoryId));
    await storeSeasonGroups(groups, categoryId, competitionId, seasonId);
    return { refreshed: 1, failures };
  } catch (error) {
    return { refreshed: 0, failures: [...failures, failure("taso", code, seasonId, error)] };
  }
}

async function refreshForeignSeason(
  code: string,
  seasonId: number,
  paced: Paced
): Promise<DailyRefreshReport> {
  try {
    const matches = await paced(() => getFootballDataSeasonMatches(code, seasonId));
    await synchronizeFootballDataMatches(matches);
    return { refreshed: 1, failures: [] };
  } catch (error) {
    return { refreshed: 0, failures: [failure("football-data", code, seasonId, error)] };
  }
}

async function refreshForeign(code: string, paced: Paced): Promise<DailyRefreshReport> {
  let context: Awaited<ReturnType<typeof getSeasonContext>>;
  try {
    context = await paced(() => getSeasonContext(code));
  } catch (error) {
    return { refreshed: 0, failures: [failure("football-data", code, null, error)] };
  }
  const seasons = [context.activeSeasonId];
  if (context.upcomingSeasonId !== undefined) seasons.push(context.upcomingSeasonId);
  return combined(
    await Promise.all(seasons.map((seasonId) => refreshForeignSeason(code, seasonId, paced)))
  );
}

function combined(reports: readonly DailyRefreshReport[]): DailyRefreshReport {
  return {
    refreshed: reports.reduce((sum, report) => sum + report.refreshed, 0),
    failures: reports.flatMap((report) => report.failures),
  };
}

/**
 * Stores every competition's current season from its provider, each request
 * paced. A competition that fails is named, and the others still run.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */
export async function runDailyRefresh(
  paced: ProviderPacers = providerPacers()
): Promise<DailyRefreshReport> {
  const report = combined(
    await Promise.all([
      ...DOMESTIC_COMPETITIONS.map(({ code }) => refreshDomestic(code, paced.taso)),
      ...DAILY_FOOTBALL_DATA_CODES.map((code) => refreshForeign(code, paced["football-data"])),
    ])
  );
  logger.info(report, "Daily refresh finished");
  return report;
}
