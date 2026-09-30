/**
 * How far a competition's table moves after mid-season — the data behind the
 * standings page's `Sijoitusten vaihtelu` (specs/050).
 *
 * Pure, and it decides no ranking of its own: every table comes from the
 * calculation the standings page uses for that round (S1), handed in by the
 * services. This decides which round is mid-season, what a season's figure is,
 * and which seasons make the line.
 */

import type { MatchSource } from "./match-source";
import type { RankedRow } from "./position-series";
import { calculateStandings, type NormalizedMatch, type RosterMatch } from "./standings";

/**
 * The competitions whose standings page carries the panel (S10): specs/048's
 * leagues without the Champions League, whose later rounds leave most teams
 * without a final position.
 */
const COMPETITIONS: Record<MatchSource["kind"], ReadonlySet<string>> = {
  "football-data": new Set(["PL", "ELC", "FL1", "BL1", "SA", "DED", "PPL", "PD", "BSA"]),
  taso: new Set(["VL", "M1L", "M1", "M2", "NL", "N1", "P21SM", "P211", "P18SM", "T18SM"]),
};

/** Whether a competition's standings page shows the panel (S10). */
export function hasTableVolatility(kind: MatchSource["kind"], code: string): boolean {
  return COMPETITIONS[kind].has(code);
}

/** The round after which a season of `rounds` rounds is halfway through (S7). */
export function midSeasonRound(rounds: number): number {
  return Math.ceil(rounds / 2);
}

/** Every team's movement in one table, summed, and how many teams it covers. */
export type Movement = { total: number; teams: number };

/**
 * |final − mid-season| summed over the teams in **both** tables (S6, S12): a
 * team in only one — a withdrawal, annulled results — is left out of the
 * season's figure rather than erasing it.
 */
export function movementBetween(
  midSeason: readonly RankedRow[],
  final: readonly RankedRow[]
): Movement {
  const midPositions = new Map(midSeason.map((row) => [row.teamProviderId, row.position]));
  let total = 0;
  let teams = 0;
  for (const row of final) {
    const mid = midPositions.get(row.teamProviderId);
    if (mid === undefined) continue;
    total += Math.abs(row.position - mid);
    teams += 1;
  }
  return { total, teams };
}

/**
 * A football-data season: one table all season, so mid-season is the table
 * after round ⌈R / 2⌉ and the final one the standings page's own — the same
 * arguments `getStandings` passes (S1). A season with no numbered round has no
 * per-round table, so no figure (S9).
 */
export function singleTableMovement(
  finished: readonly NormalizedMatch[],
  roster: ReadonlyArray<RosterMatch & { matchday: number | null }>
): Movement | null {
  const rounds = roster.flatMap((match) => (match.matchday === null ? [] : [match.matchday]));
  if (rounds.length === 0) return null;

  const mid = midSeasonRound(Math.max(...rounds));
  return movementBetween(
    calculateStandings(
      finished.filter((match) => match.matchday !== null && match.matchday <= mid),
      [...roster]
    ),
    calculateStandings([...finished], [...roster])
  );
}

/** One completed season, and its movement — or `null` without per-round tables (S9). */
export type SeasonMovement = { seasonId: number; movement: Movement | null };

export type VolatilityPoint = {
  seasonId: number;
  /** The mean places moved, unrounded (S6). */
  change: number;
  teams: number;
};

export type TableVolatilitySeries =
  | {
      status: "ok";
      /** Oldest first. */
      points: VolatilityPoint[];
      yDomain: [number, number];
      yTicks: number[];
      /** How many completed seasons have no point (S9). */
      leftOut: number;
    }
  /** Fewer than two seasons with a point (S11). */
  | { status: "too-few" }
  | { status: "error" };

/**
 * The line: one point per completed season with a figure, oldest first; the
 * y-axis from 0 to the next whole place above the highest, ticked by place.
 */
export function volatilitySeries(
  seasons: readonly SeasonMovement[]
): Exclude<TableVolatilitySeries, { status: "error" }> {
  const points = seasons
    .flatMap(({ seasonId, movement }) =>
      movement === null || movement.teams === 0
        ? []
        : [{ seasonId, change: movement.total / movement.teams, teams: movement.teams }]
    )
    .sort((left, right) => left.seasonId - right.seasonId);
  if (points.length < 2) return { status: "too-few" };

  const top = Math.max(1, Math.ceil(Math.max(...points.map((point) => point.change))));
  return {
    status: "ok",
    points,
    yDomain: [0, top],
    yTicks: Array.from({ length: top + 1 }, (_, place) => place),
    leftOut: seasons.length - points.length,
  };
}
