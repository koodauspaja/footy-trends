/**
 * The previous meetings between two teams, and the sentence that says how far
 * back we could look.
 *
 * The selection itself is SQL — see `match-service.ts`. What lives here is the
 * part that has to be right in words rather than in rows: how deep the window
 * is per source, and how that is stated to a reader. See
 * specs/019-match-page.md.
 */

import { earliestSeasonFor } from "./competitions";
import type { MatchSource } from "./match-source";
import { EARLIEST_NATIONAL_TEAM_YEAR } from "./national-team";
import { formatSeasonLabel, resolveEarliestSeason } from "./seasons";
import { EARLIEST_TASO_SEASON } from "./taso";

/** How many meetings the page lists. Five, per #71 — the data supports more. */
export const HEAD_TO_HEAD_LIMIT = 5;

/**
 * The window the head-to-head was drawn from.
 *
 * A season for the club game, a calendar year for the national teams — whose
 * matches are grouped by the year they were played rather than by a season at
 * all (specs/018).
 */
export type HeadToHeadWindow = { kind: "season"; label: string } | { kind: "year"; year: number };

/**
 * The window sentence, shown whether or not there are meetings to explain.
 *
 * "tallennettuihin" — stored — is load-bearing. It claims a window we looked
 * in, not a set of seasons we guarantee are complete, which is the truth: a
 * season is synced when someone browses it. The measured asymmetry is the
 * reason the sentence exists at all: 47% of football-data pairs have two
 * meetings or fewer, against 10% in Veikkausliiga, where the deepest pair has
 * 35. Without it, "2 aiempaa kohtaamista" reads as a fact about the teams
 * rather than about our data.
 */
export function headToHeadWindowSentence(window: HeadToHeadWindow): string {
  const from = window.kind === "season" ? `kaudesta ${window.label}` : `vuodesta ${window.year}`;
  return `Perustuu ${from} alkaen tallennettuihin otteluihin.`;
}

/**
 * How far back this source can reach, read from the constants that actually
 * bound it rather than repeated as a literal on the page.
 *
 * `spansCalendarYears` only shapes the label — `2023/24` for a league,
 * `2026` for a tournament played inside one summer.
 */
export function headToHeadWindow(
  source: MatchSource,
  match: { competitionCode: string },
  spansCalendarYears: boolean
): HeadToHeadWindow {
  if (source.kind === "taso") {
    return source.bucket === "national"
      ? { kind: "year", year: EARLIEST_NATIONAL_TEAM_YEAR }
      : { kind: "season", label: String(EARLIEST_TASO_SEASON) };
  }

  const planFloor = resolveEarliestSeason(process.env.FOOTBALL_DATA_EARLIEST_SEASON);
  const earliest = earliestSeasonFor(match.competitionCode, planFloor);
  return { kind: "season", label: formatSeasonLabel(earliest, spansCalendarYears) };
}
