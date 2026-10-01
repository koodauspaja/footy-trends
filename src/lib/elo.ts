/**
 * Elo ratings (specs/053): a strength for every team, replayed from stored
 * results, and a three-way prediction from two of them.
 *
 * Pure: the services read the finished matches; the replay, the season
 * regression and the prediction are decided here.
 */

import type { MatchSource } from "./match-source";

/** The model's name in the predictions log; a change to any constant is a new one (S2). */
export const ELO_MODEL = "elo-v1";

/** Every team's first rating (S3). */
export const ELO_START = 1500;

/** How far one result moves a rating (S2). */
export const ELO_K = 20;

/** Rating points added to the home side's before the expectation is taken (S2). */
export const ELO_HOME_ADVANTAGE = 60;

/** How far back to 1500 a rating moves at a team's first match of a new season (S3). */
export const ELO_REGRESSION = 1 / 3;

/** TASO's unresolved bracket slot: not a team, never rated (specs/053, Edge Cases). */
const PLACEHOLDER_TEAM = 0;

/** One finished match, its score after extra time (specs/049 S3). */
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
};

/** A team's rating, and the season it was last rated in. */
export type TeamRating = { rating: number; seasonId: number };

/** A team's rating after one of its matches. */
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

/** Home win, draw and away win, 0–1, summing to 1. */
export type ThreeWay = { home: number; draw: number; away: number };

/** The home side's expected score (win 1, draw ½), its 60 points included (S2). */
export function expectedHome(homeRating: number, awayRating: number): number {
  return 1 / (1 + 10 ** ((awayRating - (homeRating + ELO_HOME_ADVANTAGE)) / 400));
}

/**
 * The three outcomes (S4): the draw is the competition's draw share, and home
 * and away split the rest by the Elo expectation.
 */
export function threeWay(homeRating: number, awayRating: number, drawShare: number): ThreeWay {
  const expected = expectedHome(homeRating, awayRating);
  return {
    home: (1 - drawShare) * expected,
    draw: drawShare,
    away: (1 - drawShare) * (1 - expected),
  };
}

/**
 * A team's rating going into a match of `seasonId`: 1500 for a team never
 * rated, and a third of the way back to 1500 at its first match of a later
 * season (S3, S14).
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

function isRateable(match: EloMatch): boolean {
  return match.homeTeam !== PLACEHOLDER_TEAM && match.awayTeam !== PLACEHOLDER_TEAM;
}

function homeScore(match: EloMatch): number {
  if (match.homeGoals > match.awayGoals) return 1;
  return match.homeGoals === match.awayGoals ? 0.5 : 0;
}

/**
 * Every match in kickoff order. Matches sharing a kickoff are all rated from
 * the ratings before any of them, then all update — neither is evidence for
 * the other (as specs/052 S14). `onPredict`, when given, sees each match with
 * the two ratings it was played at, before it updates them: the backtest's
 * view of what was known at kickoff.
 *
 * Feed one provider at a time: the two id spaces never meet (S1).
 */
export function replayElo(
  matches: readonly EloMatch[],
  onPredict?: (match: EloMatch, homeRating: number, awayRating: number) => void
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
    const together = ordered.slice(index, end).map((match) => {
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
    index = end;
  }
  return { ratings, history };

  /** A team's rating after a match, in its history; the rating itself is already set. */
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
 * side is a placeholder (S4, S16 is the caller's: no draw share, no call).
 */
export function predictElo(
  ratings: ReadonlyMap<number, TeamRating>,
  homeTeam: number,
  awayTeam: number,
  seasonId: number,
  drawShare: number
): { prediction: ThreeWay; homeRating: number; awayRating: number } | null {
  if (homeTeam === PLACEHOLDER_TEAM || awayTeam === PLACEHOLDER_TEAM) return null;
  const homeRating = ratingFor(ratings, homeTeam, seasonId);
  const awayRating = ratingFor(ratings, awayTeam, seasonId);
  return { prediction: threeWay(homeRating, awayRating, drawShare), homeRating, awayRating };
}
