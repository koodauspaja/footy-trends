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
import { resolveTasoSeasonCeiling, seasonShownBeforeMatches } from "../taso/taso-seasons";
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

// A season's matches and groups: how many matches TASO sent, or the failure, named and logged.
async function refreshDomesticSeason(
  code: string,
  seasonId: number,
  paced: Paced
): Promise<{ matches: number } | { failure: string }> {
  const categoryId = categoryIdForSeason(code, seasonId);
  const competitionId = competitionIdForSeason(code, seasonId);
  try {
    const matches = await paced(() => getTasoSeasonMatches(competitionId, categoryId, seasonId));
    await synchronizeTasoMatches(matches);
    const groups = await paced(() => getSeasonGroups(competitionId, categoryId));
    await storeSeasonGroups(groups, categoryId, competitionId, seasonId);
    return { matches: matches.length };
  } catch (error) {
    return { failure: failure("taso", code, seasonId, error) };
  }
}

function reportOf(outcome: { matches: number } | { failure: string }): DailyRefreshReport {
  return "failure" in outcome
    ? { refreshed: 0, failures: [outcome.failure] }
    : { refreshed: 1, failures: [] };
}

async function refreshDomestic(code: string, paced: Paced): Promise<DailyRefreshReport> {
  let ceiling: Awaited<ReturnType<typeof resolveTasoSeasonCeiling>>;
  try {
    ceiling = await paced(() => resolveTasoSeasonCeiling(code));
  } catch (error) {
    return { refreshed: 0, failures: [failure("taso", code, null, error)] };
  }
  const reports: DailyRefreshReport[] = [];
  if (ceiling.discoveryFailed) {
    const discovery = failure("taso", code, null, new Error("TASO season discovery failed"));
    // With nothing stored, the fallback is the competition's first season: past.
    if (ceiling.newestStored === null) return { refreshed: 0, failures: [discovery] };
    reports.push({ refreshed: 0, failures: [discovery] });
  }
  const current = await refreshDomesticSeason(code, ceiling.currentSeason, paced);
  reports.push(reportOf(current));
  // A published season with no matches yet: the page shows the one before, and refreshes it.
  if ("matches" in current && current.matches === 0) {
    const shown = seasonShownBeforeMatches(code, ceiling.currentSeason, ceiling.newestStored);
    if (shown !== ceiling.currentSeason) {
      reports.push(reportOf(await refreshDomesticSeason(code, shown, paced)));
    }
  }
  return combined(reports);
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
