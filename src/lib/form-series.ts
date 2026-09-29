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

import { type FormResult, formResultLabel, resultFor } from "./standings";

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
  const points = teamMatchesInOrder(finished, teamId).map((match) => pointsFrom(match, teamId));

  if (points.length < FORM_WINDOW) return { status: "too-few" };

  return {
    status: "ok",
    points: points.slice(FORM_WINDOW - 1).map((_, index) => ({
      match: index + FORM_WINDOW,
      form: sum(points.slice(index, index + FORM_WINDOW)) / FORM_WINDOW,
    })),
  };
}

/**
 * This team's matches, in the order every chart on the team page counts them:
 * kickoff, then provider match id. Shared with the goals charts (specs/032), so
 * "the team's fifth match" is the same match on every chart.
 */
export function teamMatchesInOrder<T extends ResultMatch>(
  finished: readonly T[],
  teamId: number
): T[] {
  return finished
    .filter((match) => match.homeTeamProviderId === teamId || match.awayTeamProviderId === teamId)
    .toSorted(
      (left, right) =>
        left.kickoffAt.getTime() - right.kickoffAt.getTime() ||
        left.providerMatchId - right.providerMatchId
    );
}

/** `[own goals, the other side's goals]`, from this team's side of the fixture. */
export function goalsFor(match: ResultMatch, teamId: number): [number, number] {
  return match.homeTeamProviderId === teamId
    ? [match.homeGoals, match.awayGoals]
    : [match.awayGoals, match.homeGoals];
}

/** This team's points from one match: 3 for a win, 1 for a draw, 0 for a loss. */
function pointsFrom(match: ResultMatch, teamId: number): number {
  const [own, other] = goalsFor(match, teamId);
  if (own > other) return 3;
  return own === other ? 1 : 0;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** One result in a team's latest form: the match, its letter and the letter's title. */
export type FormEntry<T extends ResultMatch> = { match: T; result: FormResult; label: string };

/**
 * A team's form **now**, for the head-to-head page (specs/047): its last
 * `FORM_WINDOW` matches, oldest first as the `Vire` column reads, their points
 * per match, and when the newest was played.
 */
export type LatestForm<T extends ResultMatch> =
  | { status: "ok"; entries: Array<FormEntry<T>>; pointsPerMatch: number; latest: Date }
  /** Fewer than `FORM_WINDOW` stored matches: no full window (specs/047, S9). */
  | { status: "too-few" };

/**
 * The team's latest form over the matches given, with the same points rule as
 * `formSeries` — so it equals that series' last point over the same matches,
 * by construction rather than by a second formula (specs/047, S2).
 */
export function latestForm<T extends ResultMatch>(
  finished: readonly T[],
  teamId: number
): LatestForm<T> {
  const window = teamMatchesInOrder(finished, teamId).slice(-FORM_WINDOW);
  if (window.length < FORM_WINDOW) return { status: "too-few" };

  return {
    status: "ok",
    entries: window.map((match) => {
      const result = resultFor(...goalsFor(match, teamId));
      return { match, result, label: formResultLabel(result) };
    }),
    pointsPerMatch: sum(window.map((match) => pointsFrom(match, teamId))) / FORM_WINDOW,
    // The window is in kickoff order, so this is its last match's kickoff.
    latest: new Date(Math.max(...window.map((match) => match.kickoffAt.getTime()))),
  };
}
