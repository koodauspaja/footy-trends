/**
 * A competition's goals per game in each stored season: the data behind the
 * standings page's `Maaleja ottelua kohden`. Pure: it decides which seasons
 * are drawn, their axis, and which are left out and why.
 *
 * decisions/048-league-goals-per-game-trend.md
 * decisions/049-home-advantage-and-draw-rate.md
 */

import { FORM_WINDOW } from "./form-series";
import type { MatchSource } from "./match-source";

/**
 * The competitions whose standings page carries the section: the leagues of
 * both providers and the Champions League. The comparison of competitions
 * uses exactly these.
 *
 * decisions/048-league-goals-per-game-trend.md
 * decisions/049-home-advantage-and-draw-rate.md
 */
export const COMPETITIONS: Record<MatchSource["kind"], ReadonlySet<string>> = {
  "football-data": new Set(["PL", "ELC", "FL1", "BL1", "SA", "DED", "PPL", "PD", "BSA", "CL"]),
  taso: new Set(["VL", "M1L", "M1", "M2", "NL", "N1", "P21SM", "P211", "P18SM", "T18SM"]),
};

/**
 * Whether a competition's standings page shows goals per game.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
export function hasGoalsPerGame(kind: MatchSource["kind"], code: string): boolean {
  return COMPETITIONS[kind].has(code);
}

/**
 * One stored season's finished matches with both scores, and their goals.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
export type SeasonGoals = { seasonId: number; matches: number; goals: number };

/**
 * One drawn season.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
export type GoalsPerGamePoint = {
  seasonId: number;
  matches: number;
  /** Goals over matches, home and away together. */
  perGame: number;
  /** The season still being played, labelled `(kesken)`. */
  inProgress: boolean;
};

export type GoalsPerGameSeries =
  | {
      status: "ok";
      /** Oldest first. */
      points: GoalsPerGamePoint[];
      /** The y-axis, to the nearest 0,5 either side of the data. */
      yDomain: [number, number];
      yTicks: number[];
      /** Stored seasons with too few matches to draw, oldest first. */
      leftOut: number[];
    }
  /** Fewer than two seasons to draw. */
  | { status: "too-few" }
  | { status: "error" };

/**
 * The step the y-axis moves in.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
const HALF = 0.5;

/**
 * The y-axis for the drawn seasons: from the nearest 0,5 at or below the lowest
 * to the nearest 0,5 at or above the highest, at least 0,5 tall, ticked every
 * 0,5. Doubled to whole numbers before rounding.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
export function halfStepAxis(values: readonly number[]): {
  domain: [number, number];
  ticks: number[];
} {
  const low = Math.floor(Math.min(...values) * 2) / 2;
  const rounded = Math.ceil(Math.max(...values) * 2) / 2;
  const high = rounded > low ? rounded : low + HALF;
  const steps = Math.round((high - low) / HALF);
  return {
    domain: [low, high],
    ticks: Array.from({ length: steps + 1 }, (_, index) => low + index * HALF),
  };
}

/**
 * The line: every stored season with at least `FORM_WINDOW` finished matches,
 * oldest first, and the season in progress flagged. Fewer than two such
 * seasons is too few to draw.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
export function goalsPerGameSeries(
  seasons: readonly SeasonGoals[],
  activeSeasonId: number
): Exclude<GoalsPerGameSeries, { status: "error" }> {
  const ordered = seasons.toSorted((left, right) => left.seasonId - right.seasonId);
  const points = ordered
    .filter((season) => season.matches >= FORM_WINDOW)
    .map((season) => ({
      seasonId: season.seasonId,
      matches: season.matches,
      perGame: season.goals / season.matches,
      inProgress: season.seasonId === activeSeasonId,
    }));
  if (points.length < 2) return { status: "too-few" };

  const axis = halfStepAxis(points.map((point) => point.perGame));
  return {
    status: "ok",
    points,
    yDomain: axis.domain,
    yTicks: axis.ticks,
    leftOut: ordered
      .filter((season) => season.matches > 0 && season.matches < FORM_WINDOW)
      .map((season) => season.seasonId),
  };
}
