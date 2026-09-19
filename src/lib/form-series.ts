/**
 * A team's form after each match of a season — the data behind the team page's
 * `Vire otteluittain` chart (specs/031).
 *
 * **Form is the standings table's `Vire`, plotted.** `calculateStandings` takes
 * a team's last five finished matches in kickoff order for that column; this
 * takes the same five after every match, so the last point is the column's own
 * value in points. Kickoff order, not round order, is what keeps TASO's
 * out-of-order round numbers (#413) out of it.
 *
 * Pure: the services decide which matches count, and pass them in.
 */

/** Matches in a window — the `Vire` column's five (specs/031, Q1). */
export const FORM_WINDOW = 5;

/** One point: form after the team's `match`-th match, in points per match. */
export type FormPoint = { match: number; form: number };

export type FormSeries =
  | { status: "ok"; points: FormPoint[] }
  /** Fewer than `FORM_WINDOW` finished matches: no full window yet (Q4). */
  | { status: "too-few" }
  /** No league table for this team's season, so no section (Q2). */
  | { status: "unavailable" }
  | { status: "error" };

/** Just what a result and its order need — both providers' finished rows satisfy it. */
export type ResultMatch = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamProviderId: number;
  awayTeamProviderId: number;
  homeGoals: number;
  awayGoals: number;
};

/**
 * Form after each of this team's finished matches, from the fifth on.
 *
 * `finished` may hold every team's matches; only this team's count. They are
 * ordered by kickoff, then by provider match id — one team never has two
 * matches at one kickoff, but a stable order costs nothing if the data ever
 * does. Each point is `(3 × wins + draws) / 5` over that match and the four
 * before it.
 */
export function formSeries(finished: readonly ResultMatch[], teamId: number): FormSeries {
  const points = finished
    .filter((match) => match.homeTeamProviderId === teamId || match.awayTeamProviderId === teamId)
    .toSorted(
      (left, right) =>
        left.kickoffAt.getTime() - right.kickoffAt.getTime() ||
        left.providerMatchId - right.providerMatchId
    )
    .map((match) => pointsFrom(match, teamId));

  if (points.length < FORM_WINDOW) return { status: "too-few" };

  return {
    status: "ok",
    points: points.slice(FORM_WINDOW - 1).map((_, index) => ({
      match: index + FORM_WINDOW,
      form: sum(points.slice(index, index + FORM_WINDOW)) / FORM_WINDOW,
    })),
  };
}

/** This team's points from one match: 3 for a win, 1 for a draw, 0 for a loss. */
function pointsFrom(match: ResultMatch, teamId: number): number {
  const [own, other] =
    match.homeTeamProviderId === teamId
      ? [match.homeGoals, match.awayGoals]
      : [match.awayGoals, match.homeGoals];
  if (own > other) return 3;
  return own === other ? 1 : 0;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
