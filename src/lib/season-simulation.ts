/**
 * The rest of a season played out many times: each remaining fixture drawn from
 * a model's three probabilities, the points added to the current table, and the
 * places counted. Pure: the service reads the table, the fixtures and the fit.
 *
 * decisions/061-season-simulation.md
 */

import type { ThreeWay } from "./elo";
import { PLACEHOLDER_TEAM_ID } from "./match-detail";

/**
 * How many times a season is played out.
 *
 * decisions/061-season-simulation.md
 */
export const SIMULATION_RUNS = 10_000;

/**
 * The generator's seed: one constant, so the same data gives the same figures.
 *
 * decisions/061-season-simulation.md
 */
export const SIMULATION_SEED = 61;

const FINISHED_STATUS = "FINISHED";

/**
 * The statuses of a match that will not be played as listed: football-data's
 * two, and TASO's.
 *
 * decisions/061-season-simulation.md
 */
const NOT_TO_BE_PLAYED: ReadonlySet<string> = new Set(["CANCELLED", "AWARDED", "Abandoned"]);

/**
 * Whether a stored match is still to be played: no result yet, both sides real
 * teams, and a status that does not say otherwise.
 *
 * decisions/061-season-simulation.md
 */
export function isRemainingFixture(match: {
  status: string;
  homeTeamProviderId: number;
  awayTeamProviderId: number;
}): boolean {
  return (
    match.status !== FINISHED_STATUS &&
    !NOT_TO_BE_PLAYED.has(match.status) &&
    match.homeTeamProviderId !== PLACEHOLDER_TEAM_ID &&
    match.awayTeamProviderId !== PLACEHOLDER_TEAM_ID
  );
}

/**
 * One row of the current table, given in the table's order.
 *
 * decisions/061-season-simulation.md
 */
export type TableRow = { teamProviderId: number; teamName: string; points: number };

/**
 * A remaining fixture and its three probabilities.
 *
 * decisions/061-season-simulation.md
 */
export type SimulatedFixture = { homeTeam: number; awayTeam: number; prediction: ThreeWay };

/**
 * The share of runs a team reached a place in, 0–1. `settled` when the table
 * already decides it: the share is then exactly 0 or 1.
 *
 * decisions/061-season-simulation.md
 */
export type Chance = { share: number; settled: boolean };

/**
 * A team's figures, in the current table's order.
 *
 * decisions/061-season-simulation.md
 */
export type ForecastRow = {
  teamProviderId: number;
  teamName: string;
  expectedPoints: number;
  first: Chance;
  last: Chance;
  topThree: Chance;
  bottomThree: Chance;
};

/** A seeded generator of numbers from 0 up to 1 (mulberry32). */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * How many teams rank above the team at `position` when it has `own` points
 * and every other team has `others`: more points, or as many and an earlier
 * place in the current table.
 */
function teamsAbove(position: number, own: number, others: readonly number[]): number {
  let above = 0;
  for (let other = 0; other < others.length; other += 1) {
    if (other === position) continue;
    const points = others[other] as number;
    if (points > own || (points === own && other < position)) above += 1;
  }
  return above;
}

/**
 * A chance, settled when the best and the worst the team can still do fall on
 * the same side of the place.
 */
function chanceOf(share: number, reachableAtBest: boolean, heldAtWorst: boolean): Chance {
  if (!reachableAtBest) return { share: 0, settled: true };
  if (heldAtWorst) return { share: 1, settled: true };
  return { share, settled: false };
}

/**
 * A table's forecast: every fixture drawn `runs` times from its probabilities,
 * ranked by points and then by the current order. A fixture with a side
 * outside the table is left out. A place is settled when a team winning
 * everything while nobody else gains a point cannot reach it, or a team losing
 * everything while everyone else wins all of theirs still holds it.
 *
 * decisions/061-season-simulation.md
 */
export function simulateTable(
  table: readonly TableRow[],
  fixtures: readonly SimulatedFixture[],
  runs: number = SIMULATION_RUNS,
  seed: number = SIMULATION_SEED
): ForecastRow[] {
  const size = table.length;
  const positions = new Map(table.map((row, position) => [row.teamProviderId, position]));
  const played = fixtures.flatMap((fixture) => {
    const home = positions.get(fixture.homeTeam);
    const away = positions.get(fixture.awayTeam);
    if (home === undefined || away === undefined) return [];
    const { home: homeWin, draw } = fixture.prediction;
    return [{ home, away, homeWin, homeWinOrDraw: homeWin + draw }];
  });

  const current = table.map((row) => row.points);
  const left = new Array<number>(size).fill(0);
  for (const fixture of played) {
    left[fixture.home] = (left[fixture.home] as number) + 1;
    left[fixture.away] = (left[fixture.away] as number) + 1;
  }
  const most = current.map((points, position) => points + 3 * (left[position] as number));

  const totals = new Array<number>(size).fill(0);
  const first = new Array<number>(size).fill(0);
  const last = new Array<number>(size).fill(0);
  const topThree = new Array<number>(size).fill(0);
  const bottomThree = new Array<number>(size).fill(0);
  const points = new Array<number>(size).fill(0);
  const order = table.map((_row, position) => position);
  const random = generator(seed);

  for (let run = 0; run < runs; run += 1) {
    for (let position = 0; position < size; position += 1) {
      points[position] = current[position] as number;
    }
    for (const fixture of played) {
      const drawn = random();
      if (drawn < fixture.homeWin) points[fixture.home] = (points[fixture.home] as number) + 3;
      else if (drawn < fixture.homeWinOrDraw) {
        points[fixture.home] = (points[fixture.home] as number) + 1;
        points[fixture.away] = (points[fixture.away] as number) + 1;
      } else points[fixture.away] = (points[fixture.away] as number) + 3;
    }
    // Points, then the current order: a position is its place in that order.
    order.sort((one, other) => (points[other] as number) - (points[one] as number) || one - other);
    for (let place = 0; place < size; place += 1) {
      const position = order[place] as number;
      totals[position] = (totals[position] as number) + (points[position] as number);
      if (place === 0) first[position] = (first[position] as number) + 1;
      if (place === size - 1) last[position] = (last[position] as number) + 1;
      if (place < 3) topThree[position] = (topThree[position] as number) + 1;
      if (place >= size - 3) bottomThree[position] = (bottomThree[position] as number) + 1;
    }
  }

  return table.map((row, position) => {
    const best = teamsAbove(position, most[position] as number, current);
    const worst = teamsAbove(position, current[position] as number, most);
    const share = (counts: readonly number[]) => (counts[position] as number) / runs;
    return {
      teamProviderId: row.teamProviderId,
      teamName: row.teamName,
      expectedPoints: (totals[position] as number) / runs,
      first: chanceOf(share(first), best === 0, worst === 0),
      last: chanceOf(share(last), worst === size - 1, best === size - 1),
      topThree: chanceOf(share(topThree), best < 3, worst < 3),
      bottomThree: chanceOf(share(bottomThree), worst >= size - 3, best >= size - 3),
    };
  });
}

/**
 * The stored group whose winner is the champion.
 *
 * decisions/061-season-simulation.md
 */
const TITLE_GROUP_NAME = "Mestaruussarja";

/**
 * Which columns a season shows: one table, several (split groups or pools), or
 * a regular season before its split.
 *
 * decisions/061-season-simulation.md
 */
export type ForecastLayout = "single" | "several" | "before-split";

/**
 * One table of the season in progress as the standings page shows it, with its
 * remaining fixtures. `simulated` is false for a table that is not ours.
 *
 * decisions/061-season-simulation.md
 */
export type SeasonTableInput = {
  groupName: string | null;
  simulated: boolean;
  rows: TableRow[];
  fixtures: Array<{ homeTeam: number; awayTeam: number }>;
};

/**
 * One simulated table's forecast. `decidesTitle` when first place is the title.
 *
 * decisions/061-season-simulation.md
 */
export type ForecastTable = {
  groupName: string | null;
  decidesTitle: boolean;
  rows: ForecastRow[];
};

/**
 * A season's forecast, or why there is none: nothing left to play, no table
 * of ours to simulate, nothing to show at all, or a failure.
 *
 * decisions/061-season-simulation.md
 */
export type SeasonForecast =
  | { status: "ok"; layout: ForecastLayout; tables: ForecastTable[] }
  | { status: "no-fixtures" }
  | { status: "not-simulated" }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The forecast of every simulated table of a season. A fixture the model
 * cannot predict is left out.
 *
 * decisions/061-season-simulation.md
 */
export function seasonForecast(
  layout: ForecastLayout,
  tables: readonly SeasonTableInput[],
  predict: (homeTeam: number, awayTeam: number) => { prediction: ThreeWay } | null
): Exclude<SeasonForecast, { status: "unavailable" | "error" }> {
  const simulated = tables.filter((table) => table.simulated);
  if (simulated.length === 0) return { status: "not-simulated" };
  if (simulated.every((table) => table.fixtures.length === 0)) return { status: "no-fixtures" };

  return {
    status: "ok",
    layout,
    tables: simulated.map((table) => ({
      groupName: table.groupName,
      decidesTitle: layout === "single" || table.groupName === TITLE_GROUP_NAME,
      rows: simulateTable(
        table.rows,
        table.fixtures.flatMap((fixture) => {
          const predicted = predict(fixture.homeTeam, fixture.awayTeam);
          return predicted === null ? [] : [{ ...fixture, prediction: predicted.prediction }];
        })
      ),
    })),
  };
}
