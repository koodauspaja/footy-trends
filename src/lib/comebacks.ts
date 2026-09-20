/**
 * How often a team recovers from losing at half-time — the data behind the
 * team page's `Käännetyt ottelut` panel (specs/036).
 *
 * **A match with no half-time score is counted as missing, never as 0–0.**
 * Neither provider guarantees one: football-data refuses older seasons
 * outright, and TASO omitted it for 1 of Ykkönen 2025's 132 played matches. A
 * missing score and a goalless first half must not look the same, so the panel
 * says how many it could not read.
 *
 * Counted over exactly the matches the other result panels count; the services
 * pass them in.
 */
import { goalsFor, type ResultMatch, teamMatchesInOrder } from "./form-series";

/** A finished match, with whatever half-time score the provider gave. */
export type HalfTimeMatch = ResultMatch & {
  halfTimeHome: number | null;
  halfTimeAway: number | null;
};

export type Comebacks = {
  /** Matches the team trailed at half-time, of those with a half-time score. */
  trailed: number;
  /** Of those, won at full time. */
  won: number;
  /** Of those, drew at full time. */
  drew: number;
  /** Matches counted in none of the above, because no half-time score was stored. */
  missing: number;
  /** Matches with a half-time score — what the figures are out of. */
  known: number;
};

export type ComebacksSeries =
  | ({ status: "ok" } & Comebacks)
  /** No league table for this team's season, so no panel (specs/031, Q2). */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The comeback figures from this team's finished matches. `finished` may hold
 * every team's matches; only this team's count, read from its own side of each
 * fixture at half time as well as at full time.
 */
export function comebacksOf(finished: readonly HalfTimeMatch[], teamId: number): Comebacks {
  const figures: Comebacks = { trailed: 0, won: 0, drew: 0, missing: 0, known: 0 };

  for (const match of teamMatchesInOrder(finished, teamId)) {
    const halfTime = halfTimeFor(match, teamId);
    if (halfTime === null) {
      figures.missing += 1;
      continue;
    }

    figures.known += 1;
    const [own, other] = halfTime;
    if (own >= other) continue;

    figures.trailed += 1;
    const [fullOwn, fullOther] = goalsFor(match, teamId);
    if (fullOwn > fullOther) figures.won += 1;
    else if (fullOwn === fullOther) figures.drew += 1;
  }

  return figures;
}

/** `[own, other]` at half time, or `null` when the provider gave no half-time score. */
function halfTimeFor(match: HalfTimeMatch, teamId: number): [number, number] | null {
  const { halfTimeHome, halfTimeAway } = match;
  // Both or neither: a half-score with one side missing is not a score.
  if (halfTimeHome === null || halfTimeAway === null) return null;

  return match.homeTeamProviderId === teamId
    ? [halfTimeHome, halfTimeAway]
    : [halfTimeAway, halfTimeHome];
}
