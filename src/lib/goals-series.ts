/**
 * A team's goals scored and conceded across a season — the data behind the team
 * page's `Maalit otteluittain` and `Maalit yhteensä` charts (specs/032).
 *
 * Counted over exactly the matches the form chart counts, in exactly its order
 * (`teamMatchesInOrder`), so the three charts agree on which match is which.
 * Pure: the services decide which matches count, and pass them in.
 */
import { FORM_WINDOW, goalsFor, type ResultMatch, teamMatchesInOrder } from "./form-series";

/** Scored and conceded after the team's `match`-th match. */
export type GoalsPoint = { match: number; scored: number; conceded: number };

export type GoalsSeries =
  | {
      status: "ok";
      /**
       * Per match over the last five, from the fifth match. Empty before the
       * fifth, when the chart shows its message instead.
       */
      rolling: GoalsPoint[];
      /** Running totals from the first match. Empty before the first. */
      totals: GoalsPoint[];
    }
  /** No league table for this team's season, so no panels (specs/031, Q2). */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Both series from this team's finished league matches. `finished` may hold
 * every team's matches; only this team's count, read from its own side of each
 * fixture.
 */
export function goalsSeries(
  finished: readonly ResultMatch[],
  teamId: number
): Extract<GoalsSeries, { status: "ok" }> {
  const goals = teamMatchesInOrder(finished, teamId).map((match) => goalsFor(match, teamId));

  let scored = 0;
  let conceded = 0;
  const totals = goals.map(([own, other], index) => {
    scored += own;
    conceded += other;
    return { match: index + 1, scored, conceded };
  });

  // A window's goals are the difference of two running totals, so the rolling
  // points cannot drift from the totals they sit beside.
  const rolling = totals.slice(FORM_WINDOW - 1).map((total, index) => {
    const before = totals[index - 1] ?? { scored: 0, conceded: 0 };
    return {
      match: total.match,
      scored: (total.scored - before.scored) / FORM_WINDOW,
      conceded: (total.conceded - before.conceded) / FORM_WINDOW,
    };
  });

  return { status: "ok", rolling, totals };
}
