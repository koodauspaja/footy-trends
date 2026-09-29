/**
 * How a competition's matches end — home win, draw, away win — set beside the
 * same for every other competition: the data behind the standings page's
 * `Kotietu ja tasapelit` (specs/049).
 *
 * Pure: the services count each competition-season's results, and this decides
 * which seasons count, turns the counts into shares, and orders the rows.
 */

import { getCompetitionName } from "./competitions";
import { getDomesticCompetitionName } from "./domestic-competitions";
import type { MatchSource } from "./match-source";

/**
 * The statuses of a match still to be played, on either provider. A season with
 * any of them is not completed (S19). A postponed, suspended, cancelled,
 * awarded or abandoned match is not among them: it does not hold a season open.
 */
export const LEFT_TO_PLAY = [
  "SCHEDULED",
  "TIMED",
  "IN_PLAY",
  "PAUSED",
  "EXTRA_TIME",
  "PENALTY_SHOOTOUT",
  "LIVE",
  // TASO's own, which its normaliser passes through verbatim.
  "Live",
] as const;

/** One competition-season's counts, as the services read them. */
export type SeasonOutcomes = {
  kind: MatchSource["kind"];
  code: string;
  seasonId: number;
  /** Finished matches with both scores stored (S3). */
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  /** Matches with a status in `LEFT_TO_PLAY`. */
  leftToPlay: number;
  /** Whether the season runs across two calendar years, as `2024/25`. */
  spansCalendarYears: boolean;
};

/** One competition's row. Shares are 0–100, unrounded. */
export type OutcomeRow = {
  kind: MatchSource["kind"];
  code: string;
  name: string;
  matches: number;
  homeShare: number;
  drawShare: number;
  awayShare: number;
  /** `Kotietu`: the home-win share minus the away-win share, unrounded (S5, S14). */
  advantage: number;
};

/** The first and last season a kind of season covers in the table. */
export type SeasonRange = { first: number; last: number };

export type OutcomeShares =
  | {
      status: "ok";
      /** Strongest `Kotietu` first (S11). */
      rows: OutcomeRow[];
      /** Calendar-year seasons in the table, or null when none is (S18). */
      calendarYears: SeasonRange | null;
      /** Seasons such as `2024/25` in the table, or null when none is (S18). */
      spanningYears: SeasonRange | null;
    }
  | { status: "error" };

/** `Kotietu` as printed: whole percentage points, never `-0`. */
export function roundedAdvantage(advantage: number): number {
  return Math.round(advantage) || 0;
}

/**
 * Whether a season counts (S8, S19): from the plan floor on, with finished
 * matches and none left to play.
 */
function counts(season: SeasonOutcomes, floor: number): boolean {
  return season.seasonId >= floor && season.matches > 0 && season.leftToPlay === 0;
}

function widen(range: SeasonRange | null, seasonId: number): SeasonRange {
  return range === null
    ? { first: seasonId, last: seasonId }
    : { first: Math.min(range.first, seasonId), last: Math.max(range.last, seasonId) };
}

/**
 * The table: one row per competition with a counted season, its counts summed
 * over them, ordered by `Kotietu` as printed and then by more matches (S11,
 * S17). Ordering by the printed value keeps two rows reading `+16` in the order
 * S17 gives, rather than by a decimal the reader cannot see.
 */
export function outcomeShares(
  seasons: readonly SeasonOutcomes[],
  floor: number
): Extract<OutcomeShares, { status: "ok" }> {
  const totals = new Map<
    string,
    Pick<SeasonOutcomes, "kind" | "code" | "matches" | "homeWins" | "draws" | "awayWins">
  >();
  let calendarYears: SeasonRange | null = null;
  let spanningYears: SeasonRange | null = null;

  for (const season of seasons.filter((candidate) => counts(candidate, floor))) {
    const key = `${season.kind}:${season.code}`;
    const total = totals.get(key);
    totals.set(key, {
      kind: season.kind,
      code: season.code,
      matches: (total?.matches ?? 0) + season.matches,
      homeWins: (total?.homeWins ?? 0) + season.homeWins,
      draws: (total?.draws ?? 0) + season.draws,
      awayWins: (total?.awayWins ?? 0) + season.awayWins,
    });
    if (season.spansCalendarYears) spanningYears = widen(spanningYears, season.seasonId);
    else calendarYears = widen(calendarYears, season.seasonId);
  }

  const rows = [...totals.values()].map((total): OutcomeRow => {
    const share = (count: number) => (count / total.matches) * 100;
    return {
      kind: total.kind,
      code: total.code,
      name:
        total.kind === "football-data"
          ? getCompetitionName(total.code)
          : getDomesticCompetitionName(total.code),
      matches: total.matches,
      homeShare: share(total.homeWins),
      drawShare: share(total.draws),
      awayShare: share(total.awayWins),
      advantage: share(total.homeWins) - share(total.awayWins),
    };
  });
  rows.sort(
    (left, right) =>
      roundedAdvantage(right.advantage) - roundedAdvantage(left.advantage) ||
      right.matches - left.matches
  );

  return { status: "ok", rows, calendarYears, spanningYears };
}
