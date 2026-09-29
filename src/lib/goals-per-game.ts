/**
 * A competition's goals per game in each stored season — the data behind the
 * standings page's `Maaleja ottelua kohden` (specs/048).
 *
 * Pure: the services read each season's match count and goal total, and this
 * turns them into the line — which seasons are drawn, the axis they are drawn
 * on, and which seasons are left out and why.
 */

import { FORM_WINDOW } from "./form-series";
import type { MatchSource } from "./match-source";

/**
 * The competitions whose standings page carries the section (S5): the leagues
 * of both providers and the Champions League. The domestic cups and the
 * national teams are out by choice, the World Cup and the Euro because each has
 * one stored edition and a line needs two (S10).
 */
const COMPETITIONS: Record<MatchSource["kind"], ReadonlySet<string>> = {
  "football-data": new Set(["PL", "ELC", "FL1", "BL1", "SA", "DED", "PPL", "PD", "BSA", "CL"]),
  taso: new Set(["VL", "M1L", "M1", "M2", "NL", "N1", "P21SM", "P211", "P18SM", "T18SM"]),
};

/** Whether a competition's standings page shows goals per game (S5). */
export function hasGoalsPerGame(kind: MatchSource["kind"], code: string): boolean {
  return COMPETITIONS[kind].has(code);
}

/** One stored season's finished matches with both scores, and their goals (S1). */
export type SeasonGoals = { seasonId: number; matches: number; goals: number };

/** One drawn season. */
export type GoalsPerGamePoint = {
  seasonId: number;
  matches: number;
  /** Goals over matches, home and away together (S1). */
  perGame: number;
  /** The season still being played, labelled `(kesken)` (S7). */
  inProgress: boolean;
};

export type GoalsPerGameSeries =
  | {
      status: "ok";
      /** Oldest first. */
      points: GoalsPerGamePoint[];
      /** The y-axis, to the nearest 0,5 either side of the data (S13). */
      yDomain: [number, number];
      yTicks: number[];
      /** Stored seasons with too few matches to draw, oldest first (S8, S14). */
      leftOut: number[];
    }
  /** Fewer than two seasons to draw (S10). */
  | { status: "too-few" }
  | { status: "error" };

/** The step the y-axis moves in (S13). */
const HALF = 0.5;

/**
 * The y-axis for the drawn seasons: from the nearest 0,5 at or below the lowest
 * to the nearest 0,5 at or above the highest, at least 0,5 tall, ticked every
 * 0,5 (S13). Zoomed rather than from 0 because the reader's question is the
 * change, and from 0 a league moving between 2,6 and 3,0 draws a flat line.
 *
 * Doubled to whole numbers before rounding, so a boundary value such as 2,5
 * lands on itself rather than on a neighbouring step.
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
 * The line: every stored season with at least `FORM_WINDOW` finished matches
 * (S8), oldest first, and the season in progress flagged (S7). Fewer than two
 * such seasons is too few to draw (S10).
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
