/**
 * The nine `Analyysit` panels on a national-team page (specs/041).
 *
 * **Pure, and computed from rows the page has already read.** Every other
 * team page's panels come from a service that fetches a season; this page
 * already holds its whole history by the time the section renders, so there is
 * nothing to fetch and no cache to add.
 *
 * Two axes, because the page has no season (specs/041, S3 and S4):
 *
 * - `Ottelu ottelulta` and `Koko historia` read **the whole history** — every
 *   finished match since 2018, in kickoff order;
 * - `Muut vuodet` reads **calendar years as periods** — the newest year against
 *   every earlier one, and records that run across all of them.
 *
 * The loaders are thunks rather than values, so a signed-out request computes
 * nothing at all: `AnalyticsSection` checks the gate before calling any of them.
 */
import { FINLAND_TEAM_ID } from "./national-team";
import type { NationalTeamMatch, NationalTeamYear } from "./national-team-service";
import { comparisonFor, type SeasonReadResult, UNRANKED_MEASURES } from "./season-comparison";
import { toFinishedMatches } from "./standings";
import { recordsFor } from "./streak-records";
import { teamPanelLoaders } from "./team-panels";

/**
 * The competition code the year keys carry.
 *
 * `comparisonFor` and `recordsFor` tell periods apart by
 * `{ competitionCode, seasonId }`, and `recordsFor` joins two periods into one
 * run only when the code matches and the years are consecutive — which is
 * exactly what a record spanning 31 December needs (specs/041, S4). One code for
 * every year is what makes them consecutive.
 *
 * It is never looked up in a competition registry: nothing here asks for a
 * display name, because a year names itself.
 */
export const NATIONAL_TEAM_PERIOD_CODE = "MAA";

/** A year, as `comparisonFor` and `recordsFor` key one. */
export type YearKey = { competitionCode: string; seasonId: number };

/**
 * Every match the page holds, oldest first.
 *
 * `getNationalTeamYears` answers newest year first, with each year's matches
 * chronological — which is right for reading down the page and backwards for a
 * chart, so the years are reversed and their matches kept as they are.
 */
export function history(years: readonly NationalTeamYear[]): NationalTeamMatch[] {
  return [...years].reverse().flatMap((year) => year.matches);
}

/**
 * The finished matches of the whole history, oldest first.
 *
 * Typed as the narrowed match rather than as `SeasonMatch`, so the half-time
 * score survives: `Kääntyneet ottelut` needs it, and widening here would hide
 * it from the one panel that reads it.
 */
export function finishedHistory(
  years: readonly NationalTeamYear[]
): Array<NationalTeamMatch & { homeGoals: number; awayGoals: number }> {
  return toFinishedMatches(history(years));
}

/** Every year holding at least one match, oldest first. */
export function yearKeys(years: readonly NationalTeamYear[]): YearKey[] {
  return [...years]
    .map((year) => year.year)
    .sort((left, right) => left - right)
    .map((seasonId) => ({ competitionCode: NATIONAL_TEAM_PERIOD_CODE, seasonId }));
}

/**
 * The year the comparison treats as "this" one: the newest holding a **finished**
 * match (specs/041, S6).
 *
 * Finished rather than merely scheduled, because a year whose fixtures are all
 * ahead of it has nothing to compare. In January that makes last year the
 * selected one, which is correct — it is the most recent football there is.
 *
 * `null` when nothing has been played at all, and the panel then has no period
 * to describe.
 */
export function selectedYear(years: readonly NationalTeamYear[]): number | null {
  const played = years.filter((year) => toFinishedMatches(year.matches).length > 0);
  return played.length === 0 ? null : Math.max(...played.map((year) => year.year));
}

/**
 * The span the records cover, as `Ennätykset` prints it (specs/041, S12):
 * `2018–2026`, or one year alone when that is the whole history.
 *
 * Built from the years that actually **contributed** a record rather than from
 * every year the page holds — in January the newest bucket carries fixtures and
 * no results, and a span reaching through it would claim coverage of a year
 * nothing was read from. `recordsFor` passes those years in, so this cannot
 * disagree with what the panel is showing.
 *
 * An en dash, matching every other range this app writes.
 */
export function yearSpan(years: readonly number[]): string {
  if (years.length === 0) return "";

  const from = Math.min(...years);
  const to = Math.max(...years);
  return from === to ? `${from}` : `${from}–${to}`;
}

/**
 * One year as a period the shared orchestrators can read.
 *
 * `points` is empty and `teamCount` is 0 because no national-team match ranks
 * anybody: there is no table, so `seasonLength` finds no rounds, the share
 * falls back to the whole period, and the position comes out `null` — which is
 * why the panel is asked for `UNRANKED_MEASURES` and shows no `Sijoitus` row at
 * all (specs/041, S7).
 *
 * `competition` is the **year**, because a year here spans friendlies,
 * qualifiers and a tournament at once: the competition is not what tells one
 * period from another, the year is (specs/041, S8).
 *
 * A year with no finished match is `empty` rather than an empty period: it can
 * contribute to neither a baseline nor a record, and counting it would let both
 * panels describe a year they read nothing from — the same rule `selectedYear`
 * applies at the other end (specs/041, S6).
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
 * The nine loaders `AnalyticsSection` takes, over one team's history.
 *
 * Each one computes when it is called and not before, so the gate in
 * `AnalyticsSection` still decides whether any of this is computed at all.
 */
export function nationalTeamAnalytics(years: readonly NationalTeamYear[]) {
  return {
    // No table, ever, so the one panel that needs one is absent (specs/041, S1
    // of the panels, and the same shape specs/040 gave a cup).
    loadPosition: () => Promise.resolve({ status: "unavailable" as const }),
    // Clubs only (specs/045, S5): TASO has no id stable across categories for
    // Finland or its opponents, so one country could split into several rows.
    loadOpponents: () => Promise.resolve({ status: "unavailable" as const }),
    // Clubs only (specs/053 S5).
    loadElo: () => Promise.resolve({ series: { status: "unavailable" as const } }),
    // The six result panels, over the whole history.
    ...teamPanelLoaders(
      // No competition or season to name: the panels cover the whole history.
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
        // Not the competitions met: the records deliberately cross all of them,
        // so what a reader needs is how far back they reach (specs/041, S12).
        // The years come from `recordsFor`, so the line names what was read.
        (covered) => yearSpan(covered.map(({ seasonId }) => seasonId))
      ),
  };
}
