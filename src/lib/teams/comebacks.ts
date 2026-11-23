/**
 * What became of a team's matches after half-time: the data behind the team
 * page's `Kääntyneet ottelut` panel. A match with no half-time score is
 * counted as missing, never as 0–0.
 *
 * decisions/031-rolling-form-trend.md
 * decisions/036-halftime-comebacks.md
 * decisions/037-blown-leads.md
 */
import { goalsFor, type ResultMatch, teamMatchesInOrder } from "./form-series";

/**
 * A finished match, with whatever half-time score the provider gave.
 *
 * decisions/036-halftime-comebacks.md
 */
export type HalfTimeMatch = ResultMatch & {
  halfTimeHome: number | null;
  halfTimeAway: number | null;
};

/**
 * One half-time position, and what became of the matches in it. All three
 * outcomes are counted, so `won + drew + lost` equals `matches`.
 *
 * decisions/037-blown-leads.md
 */
export type HalfTimeOutcomes = {
  /** Matches in this position at the break. */
  matches: number;
  won: number;
  drew: number;
  lost: number;
};

export type Comebacks = {
  /** Matches the team trailed at half-time, of those with a half-time score. */
  trailed: HalfTimeOutcomes;
  /** Matches the team led at half-time. */
  led: HalfTimeOutcomes;
  /** Matches counted in neither direction, because no half-time score was stored. */
  missing: number;
  /**
   * Matches with a half-time score — what the figures are out of. Larger than
   * `trailed.matches + led.matches` exactly when a match was level at the
   * break, which belongs to neither direction.
   */
  known: number;
};

export type ComebacksSeries =
  | ({ status: "ok" } & Comebacks)
  /** No league table for this team's season, so no panel. */
  | { status: "unavailable" }
  | { status: "error" };

function noOutcomes(): HalfTimeOutcomes {
  return { matches: 0, won: 0, drew: 0, lost: 0 };
}

/**
 * Both directions' figures from this team's finished matches. `finished` may
 * hold every team's matches; only this team's count, read from its own side of
 * each fixture at half time as well as at full time.
 *
 * decisions/036-halftime-comebacks.md
 * decisions/037-blown-leads.md
 */
export function comebacksOf(finished: readonly HalfTimeMatch[], teamId: number): Comebacks {
  const figures: Comebacks = { trailed: noOutcomes(), led: noOutcomes(), missing: 0, known: 0 };

  for (const match of teamMatchesInOrder(finished, teamId)) {
    const halfTime = halfTimeFor(match, teamId);
    if (halfTime === null) {
      figures.missing += 1;
      continue;
    }

    figures.known += 1;
    const [own, other] = halfTime;
    // Level at the break belongs to neither direction.
    if (own === other) continue;

    record(own < other ? figures.trailed : figures.led, ...goalsFor(match, teamId));
  }

  return figures;
}

/**
 * Adds one match's full-time outcome to the direction it was trailing or leading in.
 *
 * decisions/037-blown-leads.md
 */
function record(outcomes: HalfTimeOutcomes, own: number, other: number): void {
  outcomes.matches += 1;
  if (own > other) outcomes.won += 1;
  else if (own === other) outcomes.drew += 1;
  else outcomes.lost += 1;
}

/**
 * `[own, other]` at half time, or `null` when the provider gave no half-time score.
 *
 * decisions/036-halftime-comebacks.md
 */
function halfTimeFor(match: HalfTimeMatch, teamId: number): [number, number] | null {
  const { halfTimeHome, halfTimeAway } = match;
  // Both or neither: a half-score with one side missing is not a score.
  if (halfTimeHome === null || halfTimeAway === null) return null;

  return match.homeTeamProviderId === teamId
    ? [halfTimeHome, halfTimeAway]
    : [halfTimeAway, halfTimeHome];
}
