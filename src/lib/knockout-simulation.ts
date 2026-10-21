/**
 * The rest of a knockout competition played out many times: the league phase's
 * remaining fixtures, the draws not yet made, both legs of each tie, extra time
 * and penalties. Pure: the service reads the table, the ties and the fit.
 *
 * decisions/067-knockout-simulation.md
 */

import type { Zone } from "./competition-zones";
import type { BracketTeam } from "./cup-bracket";
import { scoreGrid } from "./poisson";
import {
  type Chance,
  type ForecastRow,
  generator,
  SIMULATION_RUNS,
  SIMULATION_SEED,
  type SimulatedFixture,
  simulateTable,
  type TableRow,
} from "./season-simulation";

/**
 * A pairing's expected goals at the first side's ground and its scoreline grid,
 * `grid[home][away]`: what a leg and its extra time are drawn from.
 *
 * decisions/067-knockout-simulation.md
 */
export type GoalModel = (
  home: number,
  away: number
) => { homeGoals: number; awayGoals: number; grid: readonly (readonly number[])[] };

/**
 * Extra time's share of a match, by which its expected goals are scaled (S8).
 *
 * decisions/067-knockout-simulation.md
 */
const EXTRA_TIME_SHARE = 30 / 90;

/**
 * A grid's goal differences, home minus away, from the most the grid holds
 * against the home side to the most for it: their probabilities, summing to 1.
 *
 * decisions/067-knockout-simulation.md
 */
function differences(grid: readonly (readonly number[])[]): number[] {
  const span = grid.length - 1;
  const mass = new Array<number>(2 * span + 1).fill(0);
  grid.forEach((row, home) => {
    row.forEach((cell, away) => {
      mass[home - away + span] = (mass[home - away + span] as number) + cell;
    });
  });
  return mass;
}

/**
 * A neutral ground: the mean of the pairing played at each side's ground, from
 * the first side's point of view.
 *
 * decisions/067-knockout-simulation.md
 */
function neutral(atFirst: readonly number[], atSecond: readonly number[]): number[] {
  const reversed = atSecond.toReversed();
  return atFirst.map((share, index) => (share + (reversed[index] as number)) / 2);
}

function cumulative(mass: readonly number[]): number[] {
  let total = 0;
  return mass.map((share) => {
    total += share;
    return total;
  });
}

/**
 * A goal difference drawn from cumulative shares: the first index the drawn
 * number falls under, counted from the middle.
 *
 * decisions/067-knockout-simulation.md
 */
function drawDifference(shares: readonly number[], random: () => number): number {
  const target = random() * (shares.at(-1) as number);
  let low = 0;
  let high = shares.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((shares[middle] as number) > target) high = middle;
    else low = middle + 1;
  }
  return low - (shares.length - 1) / 2;
}

/**
 * The goal differences a leg and its extra time are drawn from, each pairing's
 * worked out once for the whole simulation.
 *
 * decisions/067-knockout-simulation.md
 */
export type Odds = {
  leg: (home: number, away: number, atNeutralGround: boolean) => readonly number[];
  extraTime: (home: number, away: number, atNeutralGround: boolean) => readonly number[];
};

/**
 * The odds of a model: a leg from its grid, extra time from a third of its
 * expected goals on the plain grid, with no draw factor (S8).
 *
 * decisions/067-knockout-simulation.md
 */
export function oddsOf(model: GoalModel): Odds {
  const atGround: AtGround = (home, away) => differences(model(home, away).grid);
  const extra: AtGround = (home, away) => {
    const { homeGoals, awayGoals } = model(home, away);
    return differences(scoreGrid(homeGoals * EXTRA_TIME_SHARE, awayGoals * EXTRA_TIME_SHARE, 1));
  };
  return { leg: remembered(anyGround(atGround)), extraTime: remembered(anyGround(extra)) };
}

/**
 * A pairing's goal differences at its first side's ground.
 *
 * decisions/067-knockout-simulation.md
 */
type AtGround = (home: number, away: number) => number[];

/**
 * A pairing's differences at the first side's ground, or at a neutral one: the
 * mean of the pairing played at each side's ground.
 *
 * decisions/067-knockout-simulation.md
 */
function anyGround(atGround: AtGround) {
  return (first: number, second: number, atNeutralGround: boolean) =>
    atNeutralGround
      ? neutral(atGround(first, second), atGround(second, first))
      : atGround(first, second);
}

/**
 * A pairing's cumulative shares, worked out the first time they are asked for:
 * keyed by venue, then each side, as a leg is drawn hundreds of thousands of times.
 *
 * decisions/067-knockout-simulation.md
 */
function remembered(
  make: (home: number, away: number, atNeutralGround: boolean) => number[]
): Odds["leg"] {
  const byVenue = [
    new Map<number, Map<number, number[]>>(),
    new Map<number, Map<number, number[]>>(),
  ];
  return (home, away, atNeutralGround) => {
    const venue = byVenue[atNeutralGround ? 1 : 0] as Map<number, Map<number, number[]>>;
    let opponents = venue.get(home);
    if (opponents === undefined) {
      opponents = new Map();
      venue.set(home, opponents);
    }
    let shares = opponents.get(away);
    if (shares === undefined) {
      shares = cumulative(make(home, away, atNeutralGround));
      opponents.set(away, shares);
    }
    return shares;
  };
}

/**
 * A tie as it stands: `first` and `second` its sides, `lead` the first side's
 * goal difference over the legs played, `legs` the ones left in order, and
 * `decider` the last leg, where extra time is played.
 *
 * decisions/067-knockout-simulation.md
 */
export type TieInPlay = {
  first: number;
  second: number;
  lead: number;
  legs: ReadonlyArray<{ home: number; away: number }>;
  decider: { home: number; away: number };
  atNeutralGround: boolean;
};

/**
 * The side a tie sends through: the legs left drawn, then extra time at the
 * last leg when the aggregate is level, then a penalty shoot-out won by either
 * side with even odds (S8). No away goals.
 *
 * decisions/067-knockout-simulation.md
 */
export function playTie(tie: TieInPlay, odds: Odds, random: () => number): number {
  const fromFirst = (home: number, difference: number) =>
    home === tie.first ? difference : -difference;
  let lead = tie.lead;
  for (const leg of tie.legs) {
    lead += fromFirst(
      leg.home,
      drawDifference(odds.leg(leg.home, leg.away, tie.atNeutralGround), random)
    );
  }
  if (lead === 0) {
    const { home, away } = tie.decider;
    lead = fromFirst(home, drawDifference(odds.extraTime(home, away, tie.atNeutralGround), random));
  }
  if (lead === 0) return random() < 0.5 ? tie.first : tie.second;
  return lead > 0 ? tie.first : tie.second;
}

/**
 * A two-legged tie drawn by the simulation: the side with the better seed plays
 * the second leg at home (S14).
 *
 * decisions/067-knockout-simulation.md
 */
function twoLegged(better: number, worse: number): TieInPlay {
  const second = { home: better, away: worse };
  return {
    first: worse,
    second: better,
    lead: 0,
    legs: [{ home: worse, away: better }, second],
    decider: second,
    atNeutralGround: false,
  };
}

/**
 * A single match at a neutral ground: a simulated final (S14).
 *
 * decisions/067-knockout-simulation.md
 */
export function neutralMatch(first: number, second: number): TieInPlay {
  const match = { home: first, away: second };
  return { first, second, lead: 0, legs: [match], decider: match, atNeutralGround: true };
}

/**
 * One stored leg: its sides as listed, and its score once finished.
 *
 * decisions/067-knockout-simulation.md
 */
export type StoredLeg = {
  home: number;
  away: number;
  /** Normal time and extra time, from the listed home side; null until finished. */
  score: { home: number; away: number } | null;
};

/**
 * A stored tie: its sides as the bracket names them, its legs in order, and the
 * side the provider has sent through, or null while it is undecided.
 *
 * decisions/067-knockout-simulation.md
 */
export type StoredTie = {
  key: string;
  home: BracketTeam;
  away: BracketTeam;
  legs: StoredLeg[];
  winner: number | null;
};

/**
 * A stored tie as one to play on: the finished legs counted, the rest left, the
 * listed home side at home (S14).
 *
 * decisions/067-knockout-simulation.md
 */
export function tieInPlay(tie: StoredTie): TieInPlay {
  const first = tie.home.teamProviderId;
  let lead = 0;
  const legs: Array<{ home: number; away: number }> = [];
  for (const leg of tie.legs) {
    if (leg.score === null) {
      legs.push({ home: leg.home, away: leg.away });
      continue;
    }
    const difference = leg.score.home - leg.score.away;
    lead += leg.home === first ? difference : -difference;
  }
  const last = tie.legs.at(-1) as StoredLeg;
  return {
    first,
    second: tie.away.teamProviderId,
    lead,
    legs,
    decider: { home: last.home, away: last.away },
    atNeutralGround: false,
  };
}

export const PLAYOFFS = "PLAYOFFS";

/**
 * The Champions League's knockout rounds, in the order they are played.
 *
 * decisions/067-knockout-simulation.md
 */
export const KNOCKOUT_STAGES = [PLAYOFFS, "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"];

/**
 * How many ties each of `KNOCKOUT_STAGES` holds when it is stored whole.
 *
 * decisions/067-knockout-simulation.md
 */
const TIES_PER_STAGE = [8, 8, 4, 2, 1];

/**
 * The rounds a reader is shown each side's chance of reaching.
 *
 * decisions/067-knockout-simulation.md
 */
export const REACHED_STAGES = KNOCKOUT_STAGES.slice(1);

/**
 * The league phase's three stretches of places (S14): straight to the last 16,
 * to the play-offs, and out.
 *
 * decisions/067-knockout-simulation.md
 */
export const LEAGUE_PHASE_ZONES: readonly Zone[] = [
  { from: 1, to: 8, label: "Sijat 1–8" },
  { from: 9, to: 24, label: "Sijat 9–24" },
  { from: 25, to: 36, label: "Sijat 25–36" },
];

/**
 * A round's stored ties, when the provider holds every pairing of it between two
 * known sides, each with both legs before the final; otherwise the round is drawn.
 *
 * decisions/067-knockout-simulation.md
 */
function storedRound(
  rounds: ReadonlyMap<string, readonly StoredTie[]>,
  stage: string
): readonly StoredTie[] | null {
  const ties = rounds.get(stage) ?? [];
  const whole =
    ties.length === TIES_PER_STAGE[KNOCKOUT_STAGES.indexOf(stage)] &&
    ties.every((tie) => tie.legs.length === legsPerTie(stage));
  return whole ? ties : null;
}

/**
 * How many legs a Champions League tie of a stage has: the final one, every
 * round before it two.
 *
 * decisions/067-knockout-simulation.md
 */
export function legsPerTie(stage: string): number {
  return stage === KNOCKOUT_STAGES.at(-1) ? 1 : 2;
}

/**
 * One run's state: each side's seed, its league-phase place or the one it took
 * over from a side it beat (S9), and which half of the tree it is in once known.
 *
 * decisions/067-knockout-simulation.md
 */
type Run = {
  seeds: Map<number, number>;
  halves: Map<number, number>;
  odds: Odds;
  random: () => number;
  /** Each stored, undecided tie's first side going through, counted. */
  onStoredTie: (key: string, firstWent: boolean) => void;
};

function seedOf(run: Run, team: number): number {
  return run.seeds.get(team) ?? Number.POSITIVE_INFINITY;
}

/**
 * A tie's winner, who takes the better of the two seeds.
 *
 * decisions/067-knockout-simulation.md
 */
function decide(run: Run, tie: TieInPlay): number {
  const winner = playTie(tie, run.odds, run.random);
  run.seeds.set(winner, Math.min(seedOf(run, tie.first), seedOf(run, tie.second)));
  return winner;
}

function playStored(run: Run, ties: readonly StoredTie[]): number[] {
  return ties.map((tie) => {
    if (tie.winner !== null) {
      const seed = Math.min(
        seedOf(run, tie.home.teamProviderId),
        seedOf(run, tie.away.teamProviderId)
      );
      run.seeds.set(tie.winner, seed);
      return tie.winner;
    }
    const winner = decide(run, tieInPlay(tie));
    run.onStoredTie(tie.key, winner === tie.home.teamProviderId);
    return winner;
  });
}

function bySeed(run: Run, teams: readonly number[]): number[] {
  return teams.toSorted((left, right) => seedOf(run, left) - seedOf(run, right));
}

/**
 * Two seeded sides drawn against two others, each seeded side meeting one of
 * them at random, and the ties played.
 *
 * decisions/067-knockout-simulation.md
 */
function drawPair(run: Run, seeded: readonly number[], others: readonly number[]): number[] {
  const [one, two] = seeded as [number, number];
  const swap = run.random() < 0.5;
  const [first, second] = (swap ? others.toReversed() : others) as [number, number];
  return [decide(run, twoLegged(one, first)), decide(run, twoLegged(two, second))];
}

/**
 * The play-offs drawn (S9): 9/10 against 23/24, 11/12 against 21/22, 13/14
 * against 19/20, 15/16 against 17/18. `ranked` is places 9 to 24.
 *
 * decisions/067-knockout-simulation.md
 */
function drawPlayoffs(run: Run, ranked: readonly number[]): number[] {
  return [0, 1, 2, 3].flatMap((section) => {
    const seeded = ranked.slice(2 * section, 2 * section + 2);
    const unseeded = ranked.slice(14 - 2 * section, 16 - 2 * section);
    return drawPair(run, seeded, unseeded);
  });
}

/**
 * The last 16 drawn (S9): 1/2 against the winners from 15/16–17/18, 3/4 from
 * 13/14–19/20, 5/6 from 11/12–21/22, 7/8 from 9/10–23/24.
 *
 * decisions/067-knockout-simulation.md
 */
function drawLastSixteen(run: Run, direct: readonly number[], qualified: readonly number[]) {
  const seeded = bySeed(run, direct);
  const winners = bySeed(run, qualified);
  return [0, 1, 2, 3].flatMap((pair) =>
    drawPair(run, seeded.slice(2 * pair, 2 * pair + 2), winners.slice(6 - 2 * pair, 8 - 2 * pair))
  );
}

/**
 * The quarter-finals by the seeded tree (S9): 1 and 2 in opposite halves, and
 * one of 3/4, of 5/6 and of 7/8 in each at random; in a half, the 1/2 tie's
 * winner meets the 7/8 tie's and the 3/4 tie's the 5/6 tie's.
 *
 * decisions/067-knockout-simulation.md
 */
function drawQuarterFinals(run: Run, teams: readonly number[]): number[] {
  // Read before any tie is played: a winner takes over its opponent's seed.
  const ranked = bySeed(run, teams);
  const [one, two, ...rest] = ranked as [number, number, ...number[]];
  run.halves.set(one, 0);
  run.halves.set(two, 1);
  for (let pair = 0; pair < 3; pair += 1) {
    const swap = run.random() < 0.5 ? 1 : 0;
    run.halves.set(rest[2 * pair] as number, swap);
    run.halves.set(rest[2 * pair + 1] as number, 1 - swap);
  }
  const inHalf = (half: number, from: number, to: number) =>
    ranked.slice(from, to).find((team) => run.halves.get(team) === half) as number;
  return [0, 1].flatMap((half) => [
    decideBySeed(run, inHalf(half, 0, 2), inHalf(half, 6, 8), half),
    decideBySeed(run, inHalf(half, 2, 4), inHalf(half, 4, 6), half),
  ]);
}

/**
 * A drawn two-legged tie, its winner kept in the half it was played in.
 *
 * decisions/067-knockout-simulation.md
 */
function decideBySeed(run: Run, one: number, other: number, half: number): number {
  const [better, worse] = bySeed(run, [one, other]) as [number, number];
  const winner = decide(run, twoLegged(better, worse));
  run.halves.set(winner, half);
  return winner;
}

/**
 * Stored quarter-finals' halves, which the provider does not hold (S9, at random
 * within the tree): the two ties of the 1/2 and 7/8 sides one each way, the two
 * 3/4–5/6 ties one each way at random.
 *
 * decisions/067-knockout-simulation.md
 */
function storedQuarterFinalHalves(run: Run, ties: readonly StoredTie[]): number[] {
  const ranked = bySeed(run, ties.flatMap(sidesOf));
  const outer = new Set([...ranked.slice(0, 2), ...ranked.slice(6, 8)]);
  const isOuter = (tie: StoredTie) => sidesOf(tie).some((team) => outer.has(team));
  const swap = run.random() < 0.5 ? 1 : 0;
  // The outer ties first; then the others, one each way.
  const order = ties.toSorted((left, right) => Number(isOuter(right)) - Number(isOuter(left)));
  const halves = [0, 1, swap, 1 - swap];
  return ties.map((tie) => halves[order.indexOf(tie)] as number);
}

function sidesOf(tie: StoredTie): number[] {
  return [tie.home.teamProviderId, tie.away.teamProviderId];
}

/**
 * The semi-finals: each half's two quarter-final winners.
 *
 * decisions/067-knockout-simulation.md
 */
function drawSemiFinals(run: Run, teams: readonly number[]): number[] {
  return [0, 1].map((half) => {
    const [one, other] = teams.filter((team) => run.halves.get(team) === half) as [number, number];
    return decideBySeed(run, one, other, half);
  });
}

/**
 * What one run counts, per place of the current league-phase table: the runs a
 * side reached each of `REACHED_STAGES` in, and won the final in.
 *
 * decisions/067-knockout-simulation.md
 */
type Tally = { reached: number[][]; won: number[] };

/**
 * One run of the knockout, played on from that run's league-phase order: each
 * round stored or drawn, the reached rounds counted.
 *
 * decisions/067-knockout-simulation.md
 */
function playKnockout(
  run: Run,
  teams: readonly number[],
  rounds: ReadonlyMap<string, readonly StoredTie[]>,
  count: (stage: number, team: number) => void
): number {
  const stored = (stage: string) => storedRound(rounds, stage);
  const reach = (stage: number, sides: readonly number[]) => {
    for (const team of sides) count(stage, team);
  };
  // A stored round's sides are the ones that reached it.
  const entered = (stage: number, ties: readonly StoredTie[] | null, drawn: readonly number[]) =>
    reach(stage, ties === null ? drawn : ties.flatMap(sidesOf));
  const direct = teams.slice(0, 8);
  const playoffs = stored(PLAYOFFS);
  const qualified =
    playoffs === null ? drawPlayoffs(run, teams.slice(8, 24)) : playStored(run, playoffs);

  const lastSixteen = stored("LAST_16");
  entered(0, lastSixteen, [...direct, ...qualified]);
  let entrants =
    lastSixteen === null ? drawLastSixteen(run, direct, qualified) : playStored(run, lastSixteen);

  const quarterFinals = stored("QUARTER_FINALS");
  entered(1, quarterFinals, entrants);
  if (quarterFinals === null) entrants = drawQuarterFinals(run, entrants);
  else {
    // The halves first: playing a tie moves the seeds they are read from.
    const halves = storedQuarterFinalHalves(run, quarterFinals);
    entrants = playStored(run, quarterFinals);
    entrants.forEach((team, index) => {
      run.halves.set(team, halves[index] as number);
    });
  }

  const semiFinals = stored("SEMI_FINALS");
  entered(2, semiFinals, entrants);
  entrants = semiFinals === null ? drawSemiFinals(run, entrants) : playStored(run, semiFinals);

  const final = stored("FINAL");
  entered(3, final, entrants);
  const [one, other] = entrants as [number, number];
  return final === null
    ? decide(run, neutralMatch(one, other))
    : (playStored(run, final)[0] as number);
}

/**
 * The order of a forecast's table: the chance to win, then of each later round;
 * equal chances keep the order the rows came in.
 *
 * decisions/067-knockout-simulation.md
 */
function byChances(left: KnockoutRow, right: KnockoutRow): number {
  const rank = (row: KnockoutRow) => [row.won, ...row.reached.toReversed()].map((c) => c.share);
  const [one, other] = [rank(left), rank(right)];
  const differs = one.findIndex((value, index) => value !== other[index]);
  return differs === -1 ? 0 : (other[differs] as number) - (one[differs] as number);
}

/**
 * What the Champions League's forecast is read from: the current league-phase
 * table and its remaining fixtures, and the stored knockout rounds by stage.
 *
 * decisions/067-knockout-simulation.md
 */
export type ChampionsLeagueInput = {
  table: readonly TableRow[];
  fixtures: readonly SimulatedFixture[];
  rounds: ReadonlyMap<string, readonly StoredTie[]>;
};

/**
 * A side's chance of reaching each of `REACHED_STAGES` and of winning.
 *
 * decisions/067-knockout-simulation.md
 */
export type KnockoutRow = {
  teamProviderId: number;
  teamName: string;
  reached: Chance[];
  won: Chance;
};

/**
 * A stored, undecided tie and its home side's chance of going through; the other
 * side's is the rest.
 *
 * decisions/067-knockout-simulation.md
 */
export type TieChance = { key: string; home: BracketTeam; away: BracketTeam; homeThrough: number };

/**
 * The Champions League's forecast: the league phase's figures while it has a
 * fixture left, then every side still able to reach the last 16, most likely
 * winner first, and the stored ties still to be decided.
 *
 * decisions/067-knockout-simulation.md
 */
export type ChampionsLeagueForecast = {
  leaguePhase: ForecastRow[] | null;
  rows: KnockoutRow[];
  ties: TieChance[];
};

/**
 * What the stored rounds settle: the sides each of `REACHED_STAGES` already has,
 * and the sides a decided tie has put out.
 *
 * decisions/067-knockout-simulation.md
 */
function settledByTies(rounds: ReadonlyMap<string, readonly StoredTie[]>) {
  const reached = REACHED_STAGES.map(() => new Set<number>());
  const out = new Set<number>();
  KNOCKOUT_STAGES.forEach((stage, index) => {
    for (const tie of rounds.get(stage) ?? []) {
      const sides = [tie.home.teamProviderId, tie.away.teamProviderId];
      // A side in a round has reached it, and every round before it.
      for (let earlier = 0; earlier < index; earlier += 1) {
        for (const side of sides) reached[earlier]?.add(side);
      }
      if (tie.winner === null) continue;
      for (let upTo = 0; upTo <= index; upTo += 1) reached[upTo]?.add(tie.winner);
      for (const side of sides) if (side !== tie.winner) out.add(side);
    }
  });
  return { reached, out };
}

/**
 * The Champions League's rest of the season played `runs` times: the league
 * phase by specs/061's simulation, each run's knockout played on from its order.
 *
 * decisions/067-knockout-simulation.md
 */
export function forecastChampionsLeague(
  input: ChampionsLeagueInput,
  model: GoalModel,
  runs: number = SIMULATION_RUNS,
  seed: number = SIMULATION_SEED
): ChampionsLeagueForecast {
  const { table, fixtures, rounds } = input;
  const places = new Map(table.map((row, position) => [row.teamProviderId, position]));
  const zeros = () => new Array<number>(table.length).fill(0);
  const tally: Tally = { reached: REACHED_STAGES.map(zeros), won: zeros() };
  const add = (counts: number[], team: number) => {
    const at = places.get(team);
    if (at !== undefined) counts[at] = (counts[at] as number) + 1;
  };
  const storedTies = new Map<string, number>();
  const odds = oddsOf(model);

  const leaguePhase = simulateTable(
    table,
    fixtures,
    runs,
    seed,
    LEAGUE_PHASE_ZONES,
    (order, random) => {
      const teams = order.map((position) => (table[position] as TableRow).teamProviderId);
      const run: Run = {
        seeds: new Map(teams.map((team, place) => [team, place + 1])),
        halves: new Map(),
        odds,
        random,
        onStoredTie: (key, firstWent) =>
          storedTies.set(key, (storedTies.get(key) ?? 0) + (firstWent ? 1 : 0)),
      };
      const champion = playKnockout(run, teams, rounds, (stage, team) =>
        add(tally.reached[stage] as number[], team)
      );
      add(tally.won, champion);
    }
  );

  const settled = settledByTies(rounds);
  const rows = table.flatMap((row, position): KnockoutRow[] => {
    const team = row.teamProviderId;
    const [straightThrough, , outOfIt] = (leaguePhase[position] as ForecastRow).zones;
    if (settled.out.has(team) || (outOfIt?.settled && outOfIt.share === 1)) return [];
    const share = (counts: readonly number[]) => (counts[position] as number) / runs;
    const reached = REACHED_STAGES.map((_stage, stage): Chance => {
      const certain =
        settled.reached[stage]?.has(team) === true ||
        (stage === 0 && straightThrough?.settled === true && straightThrough.share === 1);
      return certain
        ? { share: 1, settled: true }
        : { share: share(tally.reached[stage] as number[]), settled: false };
    });
    return [
      {
        teamProviderId: team,
        teamName: row.teamName,
        reached,
        won: { share: share(tally.won), settled: false },
      },
    ];
  });
  rows.sort(byChances);

  const ties = KNOCKOUT_STAGES.flatMap((stage) =>
    (rounds.get(stage) ?? []).flatMap((tie): TieChance[] => {
      const through = storedTies.get(tie.key);
      if (through === undefined) return [];
      return [{ key: tie.key, home: tie.home, away: tie.away, homeThrough: through / runs }];
    })
  );

  return { leaguePhase: fixtures.length > 0 ? leaguePhase : null, rows, ties };
}

/**
 * A cup's remaining rounds from its round of 16 (S15): each stored round's ties
 * in order, the first holding every side left; a later round may be empty.
 *
 * decisions/067-knockout-simulation.md
 */
export type CupInput = { rounds: ReadonlyArray<readonly StoredTie[]> };

/**
 * A cup's forecast: every side still in it, most likely winner first, with its
 * chance of reaching each round from the first, and the stored ties still open.
 *
 * decisions/067-knockout-simulation.md
 */
export type CupForecast = { rows: KnockoutRow[]; ties: TieChance[] };

/**
 * A round drawn by the simulation: the sides left paired at random, each tie a
 * single match at a neutral ground (S15).
 *
 * decisions/067-knockout-simulation.md
 */
function drawCupRound(run: Run, sides: readonly number[]): number[] {
  const left = [...sides];
  // Fisher–Yates, from the run's own generator.
  for (let index = left.length - 1; index > 0; index -= 1) {
    const other = Math.floor(run.random() * (index + 1));
    [left[index], left[other]] = [left[other] as number, left[index] as number];
  }
  const winners: number[] = [];
  for (let index = 0; index < left.length; index += 2) {
    winners.push(decide(run, neutralMatch(left[index] as number, left[index + 1] as number)));
  }
  return winners;
}

/**
 * A cup's rest of the season played `runs` times from its round of 16: each
 * round stored when TASO holds every tie of it between known sides, otherwise
 * drawn (S15); a stored tie's listed home side at home (S14).
 *
 * decisions/067-knockout-simulation.md
 */
export function forecastCup(
  input: CupInput,
  model: GoalModel,
  runs: number = SIMULATION_RUNS,
  seed: number = SIMULATION_SEED
): CupForecast {
  const [first = [], ...later] = input.rounds;
  const sides = first.flatMap(sidesOf);
  const names = new Map(
    first.flatMap((tie) => [
      [tie.home.teamProviderId, tie.home.teamName],
      [tie.away.teamProviderId, tie.away.teamName],
    ])
  );
  const places = new Map(sides.map((team, place) => [team, place]));
  const rounds = Math.round(Math.log2(sides.length));
  const zeros = () => new Array<number>(sides.length).fill(0);
  const tally: Tally = { reached: Array.from({ length: rounds }, zeros), won: zeros() };
  const add = (counts: number[], team: number) => {
    const at = places.get(team) as number;
    counts[at] = (counts[at] as number) + 1;
  };
  const storedTies = new Map<string, number>();
  const odds = oddsOf(model);
  const random = generator(seed);

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const run: Run = {
      seeds: new Map(),
      halves: new Map(),
      odds,
      random,
      onStoredTie: (key, firstWent) =>
        storedTies.set(key, (storedTies.get(key) ?? 0) + (firstWent ? 1 : 0)),
    };
    let left = sides;
    for (let round = 0; round < rounds; round += 1) {
      for (const team of left) add(tally.reached[round] as number[], team);
      const stored = round === 0 ? first : (later[round - 1] ?? []);
      left = stored.length === left.length / 2 ? playStored(run, stored) : drawCupRound(run, left);
    }
    add(tally.won, left[0] as number);
  }

  const settled = settledCupRounds(input.rounds, rounds);
  const rows = sides.flatMap((team, place): KnockoutRow[] => {
    if (settled.out.has(team)) return [];
    const share = (counts: readonly number[]) => (counts[place] as number) / runs;
    return [
      {
        teamProviderId: team,
        teamName: names.get(team) as string,
        reached: tally.reached.map((counts, round) =>
          settled.reached[round]?.has(team) === true
            ? { share: 1, settled: true }
            : { share: share(counts), settled: false }
        ),
        won: { share: share(tally.won), settled: false },
      },
    ];
  });
  rows.sort(byChances);

  const ties = input.rounds.flatMap((round) =>
    round.flatMap((tie): TieChance[] => {
      const through = storedTies.get(tie.key);
      if (through === undefined) return [];
      return [{ key: tie.key, home: tie.home, away: tie.away, homeThrough: through / runs }];
    })
  );
  return { rows, ties };
}

/**
 * What a cup's stored rounds settle: the sides each of its `count` rounds
 * already has, and the sides a decided tie has put out.
 *
 * decisions/067-knockout-simulation.md
 */
function settledCupRounds(rounds: ReadonlyArray<readonly StoredTie[]>, count: number) {
  const reached = Array.from({ length: count }, () => new Set<number>());
  const out = new Set<number>();
  rounds.forEach((ties, index) => {
    for (const tie of ties) {
      for (const side of sidesOf(tie)) reached[index]?.add(side);
      if (tie.winner === null) continue;
      reached[index + 1]?.add(tie.winner);
      for (const side of sidesOf(tie)) if (side !== tie.winner) out.add(side);
    }
  });
  return { reached, out };
}

/**
 * Each stored, undecided tie's chance of going either way, played `runs` times
 * on its own: a cup's ties before its round of 16 (S16).
 *
 * decisions/067-knockout-simulation.md
 */
export function tieChances(
  ties: readonly StoredTie[],
  model: GoalModel,
  runs: number = SIMULATION_RUNS,
  seed: number = SIMULATION_SEED
): TieChance[] {
  const odds = oddsOf(model);
  const random = generator(seed);
  return ties.flatMap((tie): TieChance[] => {
    if (tie.winner !== null) return [];
    const playing = tieInPlay(tie);
    let through = 0;
    for (let run = 0; run < runs; run += 1) {
      if (playTie(playing, odds, random) === playing.first) through += 1;
    }
    return [{ key: tie.key, home: tie.home, away: tie.away, homeThrough: through / runs }];
  });
}
