/**
 * The Poisson goal model: an attack and a defence strength for every team,
 * fitted to stored scores, the expected goals of a match from them, and the
 * probability of every scoreline. Pure: the services read the finished matches.
 *
 * decisions/055-poisson-goal-model.md
 */

import type { EloMatch, ThreeWay } from "./elo";
import { PLACEHOLDER_TEAM_ID } from "./match-detail";

/**
 * The model's name in the predictions log; a change to any constant is a new one.
 *
 * decisions/055-poisson-goal-model.md
 */
export const POISSON_MODEL = "poisson-v1";

/**
 * How fast a match's weight falls with its age: a half-life of about a year.
 *
 * decisions/055-poisson-goal-model.md
 */
export const POISSON_DECAY_PER_DAY = 0.0019;

/**
 * A match older than this many days is not fitted.
 *
 * decisions/055-poisson-goal-model.md
 */
export const POISSON_HORIZON_DAYS = 1500;

/**
 * The average matches every strength is pulled towards average by.
 *
 * decisions/055-poisson-goal-model.md
 */
export const POISSON_PRIOR_MATCHES = 1;

/**
 * The most goals a side has in the scoreline grid.
 *
 * decisions/055-poisson-goal-model.md
 */
export const POISSON_MAX_GOALS = 10;

/**
 * The pull on a competition's base rate and on the home advantage, in goals:
 * small, and enough that neither is the logarithm of zero.
 *
 * decisions/055-poisson-goal-model.md
 */
const RATE_PRIOR_GOALS = 0.5;

/**
 * A fit has settled when no parameter moved more than this in a sweep.
 *
 * decisions/055-poisson-goal-model.md
 */
const TOLERANCE = 1e-4;
const MAX_SWEEPS = 500;
/**
 * The home advantage a fit starts from, before any score has been read.
 *
 * decisions/055-poisson-goal-model.md
 */
const START_HOME_ADVANTAGE = 0.2;

const DAY_MS = 86_400_000;
/**
 * The draw factor is searched between a thousandth and a thousand.
 *
 * decisions/055-poisson-goal-model.md
 */
const FACTOR_LOG_BOUND = Math.log(1000);
const FACTOR_STEPS = 50;

/**
 * One finished match, its score after extra time: the same row Elo reads.
 *
 * decisions/055-poisson-goal-model.md
 */
export type PoissonMatch = EloMatch;

/**
 * One provider's fit, every strength on a log scale and 0 the average. A team
 * or a competition with no match in the window is absent.
 *
 * decisions/055-poisson-goal-model.md
 */
export type PoissonFit = {
  competitions: Map<string, { base: number; drawFactor: number }>;
  home: number;
  attack: Map<number, number>;
  defence: Map<number, number>;
};

/**
 * A match's prediction: the three outcomes, each side's expected goals, and
 * the most likely score with its probability.
 *
 * decisions/055-poisson-goal-model.md
 */
export type PoissonPrediction = {
  prediction: ThreeWay;
  homeGoals: number;
  awayGoals: number;
  score: { home: number; away: number; probability: number };
};

/**
 * The UTC day a moment falls on, counted from 1970.
 *
 * decisions/055-poisson-goal-model.md
 */
export function utcDay(at: Date): number {
  return Math.floor(at.getTime() / DAY_MS);
}

function isFittable(match: PoissonMatch): boolean {
  return match.homeTeam !== PLACEHOLDER_TEAM_ID && match.awayTeam !== PLACEHOLDER_TEAM_ID;
}

/** The probabilities of 0 to 10 goals at an expected count, not yet summing to 1. */
function goalProbabilities(expected: number): number[] {
  const probabilities: number[] = [];
  let probability = Math.exp(-expected);
  for (let goals = 0; goals <= POISSON_MAX_GOALS; goals += 1) {
    probabilities.push(probability);
    probability = (probability * expected) / (goals + 1);
  }
  return probabilities;
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/**
 * The scoreline grid, `grid[home][away]`, 0–10 a side and summing to 1: the
 * two sides' goals independent, what lies past ten spread back in proportion,
 * then the draws scaled by `drawFactor` and the whole made to sum to 1 again.
 *
 * decisions/055-poisson-goal-model.md
 */
export function scoreGrid(homeGoals: number, awayGoals: number, drawFactor: number): number[][] {
  const home = goalProbabilities(homeGoals);
  const away = goalProbabilities(awayGoals);
  const grid = home.map((homeProbability, homeScore) =>
    away.map(
      (awayProbability, awayScore) =>
        homeProbability * awayProbability * (homeScore === awayScore ? drawFactor : 1)
    )
  );
  const total = sum(grid.map(sum));
  return grid.map((row) => row.map((cell) => cell / total));
}

/**
 * The three outcomes: the grid's cells below, on and above its diagonal.
 *
 * decisions/055-poisson-goal-model.md
 */
export function outcomesOf(grid: readonly (readonly number[])[]): ThreeWay {
  const outcomes = { home: 0, draw: 0, away: 0 };
  grid.forEach((row, homeScore) => {
    row.forEach((cell, awayScore) => {
      if (homeScore > awayScore) outcomes.home += cell;
      else if (homeScore === awayScore) outcomes.draw += cell;
      else outcomes.away += cell;
    });
  });
  return outcomes;
}

/**
 * The grid's largest cell. Of equal ones, the fewer total goals, then the
 * fewer home goals.
 *
 * decisions/055-poisson-goal-model.md
 */
export function mostLikelyScore(grid: readonly (readonly number[])[]): PoissonPrediction["score"] {
  let best = { home: 0, away: 0, probability: -1 };
  grid.forEach((row, home) => {
    row.forEach((probability, away) => {
      const fewerGoals = home + away < best.home + best.away;
      // Rows run in home-goal order, so of two cells with equal totals the
      // one already held has the fewer home goals.
      if (probability > best.probability || (probability === best.probability && fewerGoals)) {
        best = { home, away, probability };
      }
    });
  });
  return best;
}

/**
 * The draw probability of the plain grid, before any draw factor.
 *
 * decisions/055-poisson-goal-model.md
 */
function plainDraw(homeGoals: number, awayGoals: number): number {
  const home = goalProbabilities(homeGoals);
  const away = goalProbabilities(awayGoals);
  return (
    sum(home.map((probability, goals) => probability * (away[goals] as number))) /
    (sum(home) * sum(away))
  );
}

/**
 * The factor that, scaling every match's draw cells, makes the average draw
 * probability equal `share`. 1 when no factor can: a share of none or of all.
 *
 * decisions/055-poisson-goal-model.md
 */
export function drawFactorFor(plainDraws: readonly number[], share: number): number {
  if (share <= 0 || share >= 1) return 1;
  const averageAt = (factor: number) =>
    sum(plainDraws.map((draw) => (factor * draw) / (factor * draw + 1 - draw))) / plainDraws.length;
  let low = -FACTOR_LOG_BOUND;
  let high = FACTOR_LOG_BOUND;
  for (let step = 0; step < FACTOR_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (averageAt(Math.exp(middle)) < share) low = middle;
    else high = middle;
  }
  return Math.exp((low + high) / 2);
}

/** Each distinct key's position, in first-seen order. */
function positions<Key>(keys: Iterable<Key>): Map<Key, number> {
  const found = new Map<Key, number>();
  for (const key of keys) if (!found.has(key)) found.set(key, found.size);
  return found;
}

/**
 * The fit of `history`, as it stands on `day`: weighted maximum likelihood by
 * sweeps over the base rates, the home advantage, the attacks and the defences
 * until none moves. `warm` is a nearby fit to start from; it changes how long
 * the sweeps take, not where they end.
 *
 * decisions/055-poisson-goal-model.md
 */
function fitWindow(history: readonly PoissonMatch[], day: number, warm?: PoissonFit): PoissonFit {
  const codes = positions(history.map((match) => match.code));
  const teams = positions(history.flatMap((match) => [match.homeTeam, match.awayTeam]));
  const count = history.length;
  const weight = new Float64Array(count);
  const competition = new Int32Array(count);
  const homeTeam = new Int32Array(count);
  const awayTeam = new Int32Array(count);
  history.forEach((match, index) => {
    weight[index] = Math.exp(-POISSON_DECAY_PER_DAY * (day - match.kickoffAt.getTime() / DAY_MS));
    competition[index] = codes.get(match.code) as number;
    homeTeam[index] = teams.get(match.homeTeam) as number;
    awayTeam[index] = teams.get(match.awayTeam) as number;
  });

  const base = Float64Array.from(codes.keys(), (code) => warm?.competitions.get(code)?.base ?? 0);
  const attack = Float64Array.from(teams.keys(), (team) => warm?.attack.get(team) ?? 0);
  const defence = Float64Array.from(teams.keys(), (team) => warm?.defence.get(team) ?? 0);
  let home = warm?.home ?? START_HOME_ADVANTAGE;

  const goals = new Float64Array(Math.max(codes.size, teams.size));
  const expected = new Float64Array(goals.length);
  // Sets every parameter of `target` from the goals counted and expected for
  // it, and answers how far the furthest one moved.
  const settle = (target: Float64Array, prior: number): number => {
    let moved = 0;
    for (let index = 0; index < target.length; index += 1) {
      const next = Math.log(
        ((goals[index] as number) + prior) / ((expected[index] as number) + prior)
      );
      moved = Math.max(moved, Math.abs(next - (target[index] as number)));
      target[index] = next;
    }
    goals.fill(0);
    expected.fill(0);
    return moved;
  };

  for (let sweep = 0; sweep < MAX_SWEEPS && count > 0; sweep += 1) {
    for (let index = 0; index < count; index += 1) {
      const match = history[index] as PoissonMatch;
      const h = homeTeam[index] as number;
      const a = awayTeam[index] as number;
      const c = competition[index] as number;
      const w = weight[index] as number;
      goals[c] = (goals[c] as number) + w * (match.homeGoals + match.awayGoals);
      expected[c] =
        (expected[c] as number) +
        w *
          (Math.exp(home + (attack[h] as number) + (defence[a] as number)) +
            Math.exp((attack[a] as number) + (defence[h] as number)));
    }
    let moved = settle(base, RATE_PRIOR_GOALS);

    let homeGoals = 0;
    let homeExpected = 0;
    for (let index = 0; index < count; index += 1) {
      const match = history[index] as PoissonMatch;
      const w = weight[index] as number;
      homeGoals += w * match.homeGoals;
      homeExpected +=
        w *
        Math.exp(
          (base[competition[index] as number] as number) +
            (attack[homeTeam[index] as number] as number) +
            (defence[awayTeam[index] as number] as number)
        );
    }
    const nextHome = Math.log((homeGoals + RATE_PRIOR_GOALS) / (homeExpected + RATE_PRIOR_GOALS));
    moved = Math.max(moved, Math.abs(nextHome - home));
    home = nextHome;

    for (const [own, other] of [
      [attack, defence],
      [defence, attack],
    ] as const) {
      for (let index = 0; index < count; index += 1) {
        const match = history[index] as PoissonMatch;
        const h = homeTeam[index] as number;
        const a = awayTeam[index] as number;
        const w = weight[index] as number;
        const rate = base[competition[index] as number] as number;
        // An attack is measured by the goals its side scored, a defence by
        // those it conceded: the home side's goals go to the home attack and
        // the away defence.
        const [homeGoalsTo, awayGoalsTo] = own === attack ? [h, a] : [a, h];
        const [homeGoalsAgainst, awayGoalsAgainst] = own === attack ? [a, h] : [h, a];
        goals[homeGoalsTo] = (goals[homeGoalsTo] as number) + w * match.homeGoals;
        expected[homeGoalsTo] =
          (expected[homeGoalsTo] as number) +
          w * Math.exp(rate + home + (other[homeGoalsAgainst] as number));
        goals[awayGoalsTo] = (goals[awayGoalsTo] as number) + w * match.awayGoals;
        expected[awayGoalsTo] =
          (expected[awayGoalsTo] as number) +
          w * Math.exp(rate + (other[awayGoalsAgainst] as number));
      }
      moved = Math.max(moved, settle(own.subarray(0, teams.size), POISSON_PRIOR_MATCHES));
    }
    if (moved < TOLERANCE) break;
  }

  const fit: PoissonFit = {
    competitions: new Map(),
    home,
    attack: new Map([...teams].map(([team, index]) => [team, attack[index] as number])),
    defence: new Map([...teams].map(([team, index]) => [team, defence[index] as number])),
  };
  const plainDraws = new Map<string, { draws: number[]; drawn: number }>();
  for (const match of history) {
    const rate = base[codes.get(match.code) as number] as number;
    const tally = plainDraws.get(match.code) ?? { draws: [], drawn: 0 };
    tally.draws.push(
      plainDraw(
        Math.exp(
          rate +
            home +
            (fit.attack.get(match.homeTeam) as number) +
            (fit.defence.get(match.awayTeam) as number)
        ),
        Math.exp(
          rate +
            (fit.attack.get(match.awayTeam) as number) +
            (fit.defence.get(match.homeTeam) as number)
        )
      )
    );
    tally.drawn += match.homeGoals === match.awayGoals ? 1 : 0;
    plainDraws.set(match.code, tally);
  }
  for (const [code, index] of codes) {
    const { draws, drawn } = plainDraws.get(code) as { draws: number[]; drawn: number };
    fit.competitions.set(code, {
      base: base[index] as number,
      drawFactor: drawFactorFor(draws, drawn / draws.length),
    });
  }
  return fit;
}

/**
 * Whether a match is one `day`'s fit reads: on a strictly earlier UTC day,
 * and no more than the horizon back.
 *
 * decisions/055-poisson-goal-model.md
 */
function inWindow(match: PoissonMatch, day: number): boolean {
  const played = utcDay(match.kickoffAt);
  return played < day && played >= day - POISSON_HORIZON_DAYS;
}

/**
 * One provider's fit as it stands on `day`, from its matches of strictly
 * earlier UTC days. Feed one provider at a time.
 *
 * decisions/055-poisson-goal-model.md
 */
export function fitPoisson(matches: readonly PoissonMatch[], day: number): PoissonFit {
  return fitWindow(
    matches.filter((match) => isFittable(match) && inWindow(match, day)),
    day
  );
}

/**
 * A match's prediction from a fit, or null when a side is a placeholder or
 * the competition has no match in the fit. A team absent from the fit is an
 * average side.
 *
 * decisions/055-poisson-goal-model.md
 */
export function predictPoisson(
  fit: PoissonFit,
  code: string,
  homeTeam: number,
  awayTeam: number
): PoissonPrediction | null {
  if (homeTeam === PLACEHOLDER_TEAM_ID || awayTeam === PLACEHOLDER_TEAM_ID) return null;
  const competition = fit.competitions.get(code);
  if (competition === undefined) return null;
  const homeGoals = Math.exp(
    competition.base + fit.home + (fit.attack.get(homeTeam) ?? 0) + (fit.defence.get(awayTeam) ?? 0)
  );
  const awayGoals = Math.exp(
    competition.base + (fit.attack.get(awayTeam) ?? 0) + (fit.defence.get(homeTeam) ?? 0)
  );
  const grid = scoreGrid(homeGoals, awayGoals, competition.drawFactor);
  return { prediction: outcomesOf(grid), homeGoals, awayGoals, score: mostLikelyScore(grid) };
}

/**
 * Every match in kickoff order, a UTC day at a time: the day's matches are all
 * predicted from one fit of the days before it. `onPredict` sees each match
 * the fit can predict. Feed one provider at a time.
 *
 * decisions/055-poisson-goal-model.md
 */
export function replayPoisson(
  matches: readonly PoissonMatch[],
  onPredict: (match: PoissonMatch, prediction: PoissonPrediction) => void
): void {
  const ordered = matches
    .filter(isFittable)
    .toSorted(
      (left, right) =>
        left.kickoffAt.getTime() - right.kickoffAt.getTime() ||
        left.providerMatchId - right.providerMatchId
    );
  let fit: PoissonFit | undefined;
  let start = 0;
  let index = 0;
  while (index < ordered.length) {
    const day = utcDay((ordered[index] as PoissonMatch).kickoffAt);
    let end = index;
    while (end < ordered.length && utcDay((ordered[end] as PoissonMatch).kickoffAt) === day) {
      end += 1;
    }
    // Sorted, so the window is the run of matches ending where this day starts.
    while (!inWindow(ordered[start] as PoissonMatch, day) && start < index) start += 1;
    fit = fitWindow(ordered.slice(start, index), day, fit);
    for (const match of ordered.slice(index, end)) {
      const prediction = predictPoisson(fit, match.code, match.homeTeam, match.awayTeam);
      if (prediction !== null) onPredict(match, prediction);
    }
    index = end;
  }
}
