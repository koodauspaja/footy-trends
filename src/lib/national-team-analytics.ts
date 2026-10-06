/**
 * The `Analyysit` panels on a national-team page, computed from rows the page
 * has already read. Two axes: the whole history match by match, and calendar
 * years as periods.
 *
 * decisions/041-national-team-analytics.md
 * decisions/045-bogey-teams.md
 * decisions/053-elo-ratings.md
 */
import { FINLAND_TEAM_ID } from "./national-team";
import type { NationalTeamMatch, NationalTeamYear } from "./national-team-service";
import { comparisonFor, type SeasonReadResult, UNRANKED_MEASURES } from "./season-comparison";
import { toFinishedMatches } from "./standings";
import { recordsFor } from "./streak-records";
import { teamPanelLoaders } from "./team-panels";

/**
 * The competition code every year key carries. One code is what makes two
 * years consecutive, so a record can span 31 December.
 *
 * decisions/041-national-team-analytics.md
 */
export const NATIONAL_TEAM_PERIOD_CODE = "MAA";

/**
 * A year, as `comparisonFor` and `recordsFor` key one.
 *
 * decisions/041-national-team-analytics.md
 */
export type YearKey = { competitionCode: string; seasonId: number };

/**
 * Every match the page holds, oldest first.
 *
 * decisions/041-national-team-analytics.md
 */
export function history(years: readonly NationalTeamYear[]): NationalTeamMatch[] {
  return [...years].reverse().flatMap((year) => year.matches);
}

/**
 * The finished matches of the whole history, oldest first, typed so the
 * half-time score survives.
 *
 * decisions/041-national-team-analytics.md
 */
export function finishedHistory(
  years: readonly NationalTeamYear[]
): Array<NationalTeamMatch & { homeGoals: number; awayGoals: number }> {
  return toFinishedMatches(history(years));
}

/**
 * Every year holding at least one match, oldest first.
 *
 * decisions/041-national-team-analytics.md
 */
export function yearKeys(years: readonly NationalTeamYear[]): YearKey[] {
  return [...years]
    .map((year) => year.year)
    .sort((left, right) => left - right)
    .map((seasonId) => ({ competitionCode: NATIONAL_TEAM_PERIOD_CODE, seasonId }));
}

/**
 * The year the comparison treats as this one: the newest holding a finished
 * match. `null` when nothing has been played at all.
 *
 * decisions/041-national-team-analytics.md
 */
export function selectedYear(years: readonly NationalTeamYear[]): number | null {
  const played = years.filter((year) => toFinishedMatches(year.matches).length > 0);
  return played.length === 0 ? null : Math.max(...played.map((year) => year.year));
}

/**
 * The span the records cover, as `Ennätykset` prints it: `2018–2026`, or one
 * year alone. Built from the years that contributed a record.
 *
 * decisions/041-national-team-analytics.md
 */
export function yearSpan(years: readonly number[]): string {
  if (years.length === 0) return "";

  const from = Math.min(...years);
  const to = Math.max(...years);
  return from === to ? `${from}` : `${from}–${to}`;
}

/**
 * One year as a period the shared orchestrators can read. No match ranks
 * anybody, so the position is `null`; a year with no finished match is `empty`.
 *
 * decisions/041-national-team-analytics.md
 */
export function readYear(
  years: readonly NationalTeamYear[],
  key: YearKey
): Promise<SeasonReadResult> {
  const year = years.find((candidate) => candidate.year === key.seasonId);
  if (year === undefined) return Promise.resolve({ status: "empty" });

  const finished = toFinishedMatches(year.matches);
  if (finished.length === 0) return Promise.resolve({ status: "empty" });

  return Promise.resolve({
    status: "ok",
    read: {
      competition: `${year.year}`,
      finished,
      all: year.matches,
      points: [],
      teamCount: 0,
    },
  });
}

/**
 * The loaders `AnalyticsSection` takes, over one team's history. Each computes
 * when called, so the sign-in gate decides whether any of it runs.
 *
 * decisions/041-national-team-analytics.md
 * decisions/045-bogey-teams.md
 * decisions/053-elo-ratings.md
 */
export function nationalTeamAnalytics(years: readonly NationalTeamYear[]) {
  return {
    // No table, ever, so the one panel that needs one is absent.
    loadPosition: () => Promise.resolve({ status: "unavailable" as const }),
    // Clubs only: no id is stable across categories for Finland or its opponents.
    loadOpponents: () => Promise.resolve({ status: "unavailable" as const }),
    // Clubs only.
    loadElo: () => Promise.resolve({ series: { status: "unavailable" as const } }),
    // The six result panels, over the whole history.
    ...teamPanelLoaders(
      // No season to name: the panels cover the whole history. `MAA` marks
      // the national team, as it does in the period keys.
      { teamProviderId: FINLAND_TEAM_ID, competitionCode: NATIONAL_TEAM_PERIOD_CODE },
      () => Promise.resolve({ status: "ok" as const, finished: finishedHistory(years) })
    ),
    // `selectedYear` is read here rather than above, so that a signed-out
    // request really does compute nothing: the gate in `AnalyticsSection` runs
    // before any loader is called.
    loadComparison: () => {
      const selected = selectedYear(years);

      return selected === null
        ? Promise.resolve({ status: "unavailable" as const })
        : comparisonFor(
            FINLAND_TEAM_ID,
            { competitionCode: NATIONAL_TEAM_PERIOD_CODE, seasonId: selected },
            yearKeys(years),
            // Every year counts: there is no division to be relegated from, and
            // no cup to keep out of a league's figures.
            () => true,
            (key) => readYear(years, key),
            UNRANKED_MEASURES
          );
    },
    loadRecords: () =>
      recordsFor(
        FINLAND_TEAM_ID,
        yearKeys(years),
        () => true,
        (seasonId) => `${seasonId}`,
        (key) => readYear(years, key),
        // How far back the records reach, not the competitions met: the records cross
        // all of them. The years come from `recordsFor`.
        (covered) => yearSpan(covered.map(({ seasonId }) => seasonId))
      ),
  };
}
