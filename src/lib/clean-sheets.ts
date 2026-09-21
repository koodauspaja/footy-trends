/**
 * How often a team keeps a clean sheet, after each match of a season — the data
 * behind the team page's `Nollapelit` chart (specs/034).
 *
 * A **running** share, not a window: a five-match window of so rare an event
 * takes only six values and sits at zero a quarter of the time, which reads as
 * missing data rather than as a run without a shut-out (specs/034, Q2).
 *
 * Counted over exactly the matches the other result charts count, in their
 * order; the services pass them in.
 */
import { goalsFor, type ResultMatch, teamMatchesInOrder } from "./form-series";

/** The share after the team's `match`-th match, and the count behind it. */
export type CleanSheetPoint = {
  match: number;
  /** Clean sheets so far. The text alternative prints `kept`/`match`. */
  kept: number;
  /** `kept / match`, as a percentage from 0 to 100. */
  share: number;
};

export type CleanSheetSeries =
  | { status: "ok"; points: CleanSheetPoint[] }
  /** No league table for this team's season, so no panel (specs/031, Q2). */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The running clean-sheet share after each of this team's finished matches.
 * `finished` may hold every team's matches; only this team's count, read from
 * its own side of each fixture.
 */
export function cleanSheetSeries(
  finished: readonly ResultMatch[],
  teamId: number
): Extract<CleanSheetSeries, { status: "ok" }> {
  let kept = 0;

  const points = teamMatchesInOrder(finished, teamId).map((match, index) => {
    const [, conceded] = goalsFor(match, teamId);
    if (conceded === 0) kept += 1;
    return { match: index + 1, kept, share: (kept / (index + 1)) * 100 };
  });

  return { status: "ok", points };
}
