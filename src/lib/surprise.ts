/**
 * How surprising a result was: the probability Elo gave it before kickoff, and
 * a season's matches ranked by it. Pure: the service reads the predictions and
 * the results.
 *
 * decisions/057-surprise-index.md
 */

/**
 * How many matches a season's list holds.
 *
 * decisions/057-surprise-index.md
 */
export const SURPRISE_LIMIT = 10;

/**
 * A finished match with both scores and Elo's backtest prediction of it. The
 * score is after extra time, a shoot-out taken out; the probabilities are 0–1.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/057-surprise-index.md
 */
export type PredictedMatch = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  home: number;
  draw: number;
  away: number;
};

/**
 * A listed match: the probability Elo gave its result, 0–1.
 *
 * decisions/057-surprise-index.md
 */
export type Surprise = PredictedMatch & { probability: number };

export type SeasonSurprises =
  | {
      status: "ok";
      /** Most surprising first, `SURPRISE_LIMIT` at most. */
      surprises: Surprise[];
      /** The season still being played, labelled `(kesken)`. */
      inProgress: boolean;
    }
  /** The competition's first stored season, which Elo has nothing behind. */
  | { status: "first-season" }
  /** No predicted match in the season. */
  | { status: "empty" }
  /** Predicted matches, every one a draw. */
  | { status: "all-drawn" }
  | { status: "error" };

/**
 * The probability Elo gave the result, or null for a draw: Elo's draw
 * probability is its competition's draw share, the same for every match, so a
 * draw is not ranked.
 *
 * decisions/057-surprise-index.md
 */
export function surpriseOf(
  match: Pick<PredictedMatch, "homeGoals" | "awayGoals" | "home" | "away">
): number | null {
  if (match.homeGoals === match.awayGoals) return null;
  return match.homeGoals > match.awayGoals ? match.home : match.away;
}

/**
 * Whether a season is the one a competition's stored history starts with, or
 * earlier, where no list is shown.
 *
 * decisions/057-surprise-index.md
 */
export function isFirstStoredSeason(seasonId: number, firstSeasonId: number | null): boolean {
  return firstSeasonId !== null && seasonId <= firstSeasonId;
}

/**
 * A season's list: its home and away wins by the probability Elo gave them,
 * smallest first, the earlier kickoff first among equals.
 *
 * decisions/057-surprise-index.md
 */
export function seasonSurprises(
  matches: readonly PredictedMatch[],
  inProgress: boolean
): SeasonSurprises {
  if (matches.length === 0) return { status: "empty" };

  const surprises = matches
    .flatMap((match) => {
      const probability = surpriseOf(match);
      return probability === null ? [] : [{ ...match, probability }];
    })
    .toSorted(
      (left, right) =>
        left.probability - right.probability ||
        left.kickoffAt.getTime() - right.kickoffAt.getTime() ||
        left.providerMatchId - right.providerMatchId
    )
    .slice(0, SURPRISE_LIMIT);
  return surprises.length === 0 ? { status: "all-drawn" } : { status: "ok", surprises, inProgress };
}
