/**
 * Elo ratings: a strength for every team, replayed from stored results, and a
 * three-way prediction from two of them. Pure: the services read the finished
 * matches.
 *
 * decisions/053-elo-ratings.md
 */

import { PLACEHOLDER_TEAM_ID } from "./match-detail";
import type { MatchSource } from "./match-source";

/**
 * The model's name in the predictions log; a change to any constant is a new one.
 *
 * decisions/053-elo-ratings.md
 */
export const ELO_MODEL = "elo-v1";

/**
 * Every team's first rating.
 *
 * decisions/053-elo-ratings.md
 */
export const ELO_START = 1500;

/**
 * How far one result moves a rating.
 *
 * decisions/053-elo-ratings.md
 */
export const ELO_K = 20;

/**
 * Rating points added to the home side's before the expectation is taken.
 *
 * decisions/053-elo-ratings.md
 */
export const ELO_HOME_ADVANTAGE = 60;

/**
 * How far back to 1500 a rating moves at a team's first match of a new season.
 *
 * decisions/053-elo-ratings.md
 */
export const ELO_REGRESSION = 1 / 3;

/**
 * One finished match, its score after extra time.
 *
 * decisions/053-elo-ratings.md
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/059-cup-predictions.md
 */
export type EloMatch = {
  source: MatchSource["kind"];
  code: string;
  seasonId: number;
  providerMatchId: number;
  kickoffAt: Date;
  homeTeam: number;
  awayTeam: number;
  homeGoals: number;
  awayGoals: number;
  /** A cup tie: predicted where both sides are rated, and never learned from. */
  cup?: boolean;
};

/**
 * A team's rating, and the season it was last rated in.
 *
 * decisions/053-elo-ratings.md
 */
export type TeamRating = { rating: number; seasonId: number };

/**
 * A team's rating after one of its matches.
 *
 * decisions/053-elo-ratings.md
 */
export type EloHistoryPoint = {
  providerMatchId: number;
  kickoffAt: Date;
  seasonId: number;
  rating: number;
};

export type EloReplay = {
  ratings: Map<number, TeamRating>;
  history: Map<number, EloHistoryPoint[]>;
};

/**
 * Home win, draw and away win, 0–1, summing to 1.
 *
 * decisions/053-elo-ratings.md
 */
export type ThreeWay = { home: number; draw: number; away: number };

/**
 * The home side's expected score (win 1, draw ½), its home advantage included:
 * 60 points unless a variant gives the side its own.
 *
 * decisions/053-elo-ratings.md
 * decisions/060-elo-variants.md
 */
export function expectedHome(
  homeRating: number,
  awayRating: number,
  homeAdvantage: number = ELO_HOME_ADVANTAGE
): number {
  return 1 / (1 + 10 ** ((awayRating - (homeRating + homeAdvantage)) / 400));
}

/**
 * The three outcomes: the draw is the competition's draw share, and home
 * and away split the rest by the Elo expectation.
 *
 * decisions/053-elo-ratings.md
 */
export function threeWay(homeRating: number, awayRating: number, drawShare: number): ThreeWay {
  return splitThreeWay(expectedHome(homeRating, awayRating), drawShare);
}

/**
 * The three outcomes from a home side's expected score: the draw is the
 * competition's draw share, and home and away split the rest by it.
 *
 * decisions/053-elo-ratings.md
 * decisions/060-elo-variants.md
 */
export function splitThreeWay(expected: number, drawShare: number): ThreeWay {
  return {
    home: (1 - drawShare) * expected,
    draw: drawShare,
    away: (1 - drawShare) * (1 - expected),
  };
}

/**
 * A team's rating going into a match of `seasonId`: 1500 for a team never
 * rated, and a third of the way back to 1500 at its first match of a later
 * season.
 *
 * decisions/053-elo-ratings.md
 */
export function ratingFor(
  ratings: ReadonlyMap<number, TeamRating>,
  team: number,
  seasonId: number
): number {
  const known = ratings.get(team);
  if (known === undefined) return ELO_START;
  if (seasonId <= known.seasonId) return known.rating;
  return known.rating + (ELO_START - known.rating) * ELO_REGRESSION;
}

/**
 * Whether a team has a rating: a match in a rated competition before now. A
 * team without one starts at 1500, which a cup tie is never predicted from.
 *
 * decisions/059-cup-predictions.md
 */
export function isRated(ratings: ReadonlyMap<number, TeamRating>, team: number): boolean {
  return ratings.has(team);
}

function isRateable(match: EloMatch): boolean {
  return match.homeTeam !== PLACEHOLDER_TEAM_ID && match.awayTeam !== PLACEHOLDER_TEAM_ID;
}

/**
 * The home side's score from a match: a win 1, a draw ½, a loss 0.
 *
 * decisions/053-elo-ratings.md
 * decisions/060-elo-variants.md
 */
export function homeScore(match: EloMatch): number {
  if (match.homeGoals > match.awayGoals) return 1;
  return match.homeGoals === match.awayGoals ? 0.5 : 0;
}

/**
 * Hands `onPredict` each cup tie of one kickoff whose two sides the leagues
 * have rated, at the ratings before that kickoff.
 *
 * decisions/059-cup-predictions.md
 */
function predictCupTies(
  atKickoff: readonly EloMatch[],
  ratings: ReadonlyMap<number, TeamRating>,
  onPredict: (match: EloMatch, homeRating: number, awayRating: number) => void
) {
  for (const match of atKickoff) {
    if (!match.cup || !isRated(ratings, match.homeTeam) || !isRated(ratings, match.awayTeam)) {
      continue;
    }
    onPredict(
      match,
      ratingFor(ratings, match.homeTeam, match.seasonId),
      ratingFor(ratings, match.awayTeam, match.seasonId)
    );
  }
}

/**
 * A league match as one kickoff played it: the ratings both sides went in with.
 *
 * decisions/060-elo-variants.md
 */
export type PlayedMatch = { match: EloMatch; home: number; away: number };

/**
 * Every match in kickoff order, a kickoff's matches rated from the ratings
 * before any of them, a cup tie never updating. `onPredict` sees each at those
 * ratings; `onPlayed` each kickoff's league matches once they are applied.
 *
 * decisions/053-elo-ratings.md
 * decisions/052-predictions-log.md
 * decisions/059-cup-predictions.md
 * decisions/060-elo-variants.md
 */
export function replayElo(
  matches: readonly EloMatch[],
  onPredict?: (match: EloMatch, homeRating: number, awayRating: number) => void,
  onPlayed?: (played: readonly PlayedMatch[]) => void
): EloReplay {
  const ratings = new Map<number, TeamRating>();
  const history = new Map<number, EloHistoryPoint[]>();
  const ordered = matches
    .filter(isRateable)
    .toSorted(
      (left, right) =>
        left.kickoffAt.getTime() - right.kickoffAt.getTime() ||
        left.providerMatchId - right.providerMatchId
    );

  let index = 0;
  while (index < ordered.length) {
    const kickoff = ordered[index]?.kickoffAt.getTime();
    let end = index;
    while (ordered[end]?.kickoffAt.getTime() === kickoff) end += 1;
    const atKickoff = ordered.slice(index, end);
    if (onPredict !== undefined) predictCupTies(atKickoff, ratings, onPredict);
    const together = atKickoff
      .filter((match) => !match.cup)
      .map((match) => {
        const home = ratingFor(ratings, match.homeTeam, match.seasonId);
        const away = ratingFor(ratings, match.awayTeam, match.seasonId);
        onPredict?.(match, home, away);
        return { match, home, away };
      });

    // Every change at this kickoff is added up before any is applied, so a
    // team in two of these matches (a stored duplicate) keeps both updates.
    const moved = new Map<number, number>();
    for (const { match, home, away } of together) {
      const delta = ELO_K * (homeScore(match) - expectedHome(home, away));
      moved.set(match.homeTeam, (moved.get(match.homeTeam) ?? home) + delta);
      moved.set(match.awayTeam, (moved.get(match.awayTeam) ?? away) - delta);
    }
    for (const { match } of together) {
      ratings.set(match.homeTeam, {
        rating: moved.get(match.homeTeam) as number,
        seasonId: match.seasonId,
      });
      ratings.set(match.awayTeam, {
        rating: moved.get(match.awayTeam) as number,
        seasonId: match.seasonId,
      });
    }
    for (const { match } of together) {
      for (const team of [match.homeTeam, match.awayTeam]) {
        record(team, ratingFor(ratings, team, match.seasonId), match);
      }
    }
    onPlayed?.(together);
    index = end;
  }
  return { ratings, history };

  // A team's rating after a match, in its history; the rating itself is already set.
  function record(team: number, rating: number, match: EloMatch) {
    const point = {
      providerMatchId: match.providerMatchId,
      kickoffAt: match.kickoffAt,
      seasonId: match.seasonId,
      rating,
    };
    const points = history.get(team);
    if (points === undefined) history.set(team, [point]);
    else points.push(point);
  }
}

/**
 * An upcoming match's prediction from the current ratings, or null when a
 * side is a placeholder. A missing draw share is the caller's: it does not call.
 *
 * decisions/053-elo-ratings.md
 */
export function predictElo(
  ratings: ReadonlyMap<number, TeamRating>,
  homeTeam: number,
  awayTeam: number,
  seasonId: number,
  drawShare: number
): { prediction: ThreeWay; homeRating: number; awayRating: number } | null {
  if (homeTeam === PLACEHOLDER_TEAM_ID || awayTeam === PLACEHOLDER_TEAM_ID) return null;
  const homeRating = ratingFor(ratings, homeTeam, seasonId);
  const awayRating = ratingFor(ratings, awayTeam, seasonId);
  return { prediction: threeWay(homeRating, awayRating, drawShare), homeRating, awayRating };
}
