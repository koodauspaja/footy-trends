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
  /** The competition's first stored season, which has no history of its own behind it. */
  | { status: "first-season" }
  /** No played match in the season. */
  | { status: "empty"; inProgress: boolean }
  /** Played matches, none of them with Elo's backtest row yet. */
  | { status: "unpredicted"; inProgress: boolean }
  /** Predicted matches, every one a draw. */
  | { status: "all-drawn"; inProgress: boolean }
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
 * earlier, where no list is shown: at or before the earliest played season.
 *
 * decisions/057-surprise-index.md
 * decisions/702-surprises-without-backtest.md
 */
export function isFirstStoredSeason(seasonId: number, playedSeasons: readonly number[]): boolean {
  return playedSeasons.length > 0 && seasonId <= Math.min(...playedSeasons);
}

/**
 * A season's list: its home and away wins by the probability Elo gave them,
 * smallest first, the earlier kickoff first among equals.
 *
 * decisions/057-surprise-index.md
 * decisions/702-surprises-without-backtest.md
 */
export function seasonSurprises(
  matches: readonly PredictedMatch[],
  { inProgress, played }: Readonly<{ inProgress: boolean; played: boolean }>
): SeasonSurprises {
  if (matches.length === 0) return { status: played ? "unpredicted" : "empty", inProgress };

  const surprises = ranked(matches).slice(0, SURPRISE_LIMIT);
  return surprises.length === 0
    ? { status: "all-drawn", inProgress }
    : { status: "ok", surprises, inProgress };
}

/**
 * The team's own win Elo thought least likely, or `null` when it won none. A
 * win is the final score's, so a shoot-out won is a draw, as everywhere here.
 *
 * decisions/057-surprise-index.md
 * decisions/066-season-summary.md
 */
export function teamUpset(matches: readonly PredictedMatch[], teamId: number): Surprise | null {
  const won = matches.filter(
    (match) =>
      (match.homeTeamProviderId === teamId && match.homeGoals > match.awayGoals) ||
      (match.awayTeamProviderId === teamId && match.awayGoals > match.homeGoals)
  );
  return ranked(won)[0] ?? null;
}

/**
 * Every win, by the probability Elo gave it, smallest first, the earlier
 * kickoff first among equals.
 *
 * decisions/057-surprise-index.md
 */
function ranked(matches: readonly PredictedMatch[]): Surprise[] {
  return matches
    .flatMap((match) => {
      const probability = surpriseOf(match);
      return probability === null ? [] : [{ ...match, probability }];
    })
    .toSorted(
      (left, right) =>
        left.probability - right.probability ||
        left.kickoffAt.getTime() - right.kickoffAt.getTime() ||
        left.providerMatchId - right.providerMatchId
    );
}
