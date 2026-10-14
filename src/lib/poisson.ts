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
 * The pull of every strength towards average: this many goals scored against
 * as many expected, about what an average side gets from one match.
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
  /** `cup` for a cup, fitted on the leagues' strengths and predicted only between teams they know. */
  competitions: Map<string, { base: number; drawFactor: number; cup?: boolean }>;
  home: number;
  attack: Map<number, number>;
  defence: Map<number, number>;
};

/**
 * A match's prediction: the three outcomes, each side's expected goals, the
 * most likely score with its probability, and the scoreline grid they come
 * from, `grid[home][away]`.
 *
 * decisions/055-poisson-goal-model.md
 * decisions/062-scoreline-probability-grid.md
 */
export type PoissonPrediction = {
  prediction: ThreeWay;
  homeGoals: number;
  awayGoals: number;
  score: { home: number; away: number; probability: number };
  grid: number[][];
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

/**
 * The probabilities of 0 to 10 goals at an expected count, not yet summing to 1.
 *
 * decisions/055-poisson-goal-model.md
 */
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
 * A scoreline grid folded to `cap` goals a side: every cell with `cap` or more
 * goals for a side summed into that side's last row or column. It sums to what
 * the grid did.
 *
 * decisions/062-scoreline-probability-grid.md
 */
export function foldScoreGrid(grid: readonly (readonly number[])[], cap: number): number[][] {
  const folded = Array.from({ length: cap + 1 }, () => new Array<number>(cap + 1).fill(0));
  grid.forEach((row, home) => {
    row.forEach((cell, away) => {
      const foldedRow = folded[Math.min(home, cap)] as number[];
      foldedRow[Math.min(away, cap)] = (foldedRow[Math.min(away, cap)] as number) + cell;
    });
  });
  return folded;
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

/**
 * Each distinct key's position, in first-seen order.
 *
 * decisions/055-poisson-goal-model.md
 */
function positions<Key>(keys: Iterable<Key>): Map<Key, number> {
  const found = new Map<Key, number>();
  for (const key of keys) if (!found.has(key)) found.set(key, found.size);
  return found;
}

/**
 * A fit's matches as columns: each match's weight on the day asked for, its
 * goals, and where its competition and its two teams sit among the parameters.
 *
 * decisions/055-poisson-goal-model.md
 */
type Columns = {
  codes: Map<string, number>;
  teams: Map<number, number>;
  weight: Float64Array;
  competition: Int32Array;
  homeTeam: Int32Array;
  awayTeam: Int32Array;
  homeGoals: Float64Array;
  awayGoals: Float64Array;
};

/**
 * The parameters being fitted, in the columns' order.
 *
 * decisions/055-poisson-goal-model.md
 */
type Strengths = {
  base: Float64Array;
  attack: Float64Array;
  defence: Float64Array;
  home: number;
};

function columnsOf(history: readonly PoissonMatch[], day: number): Columns {
  const codes = positions(history.map((match) => match.code));
  const teams = positions(history.flatMap((match) => [match.homeTeam, match.awayTeam]));
  return {
    codes,
    teams,
    weight: Float64Array.from(history, (match) =>
      Math.exp(-POISSON_DECAY_PER_DAY * (day - match.kickoffAt.getTime() / DAY_MS))
    ),
    competition: Int32Array.from(history, (match) => codes.get(match.code) as number),
    homeTeam: Int32Array.from(history, (match) => teams.get(match.homeTeam) as number),
    awayTeam: Int32Array.from(history, (match) => teams.get(match.awayTeam) as number),
    homeGoals: Float64Array.from(history, (match) => match.homeGoals),
    awayGoals: Float64Array.from(history, (match) => match.awayGoals),
  };
}

/**
 * Sets every parameter of `target` to the logarithm of its goals over those
 * expected of it, a prior added to both, and answers how far the furthest
 * one moved.
 *
 * decisions/055-poisson-goal-model.md
 */
function settle(
  target: Float64Array,
  goals: Float64Array,
  expected: Float64Array,
  prior: number
): number {
  let moved = 0;
  for (let index = 0; index < target.length; index += 1) {
    const next = Math.log(
      ((goals[index] as number) + prior) / ((expected[index] as number) + prior)
    );
    moved = Math.max(moved, Math.abs(next - (target[index] as number)));
    target[index] = next;
  }
  return moved;
}

/**
 * Each competition's base rate, from all the goals of its matches.
 *
 * decisions/055-poisson-goal-model.md
 */
function settleBase(columns: Columns, strengths: Strengths): number {
  const goals = new Float64Array(strengths.base.length);
  const expected = new Float64Array(strengths.base.length);
  const { attack, defence, home } = strengths;
  for (let index = 0; index < columns.weight.length; index += 1) {
    const h = columns.homeTeam[index] as number;
    const a = columns.awayTeam[index] as number;
    const c = columns.competition[index] as number;
    const w = columns.weight[index] as number;
    goals[c] =
      (goals[c] as number) +
      w * ((columns.homeGoals[index] as number) + (columns.awayGoals[index] as number));
    expected[c] =
      (expected[c] as number) +
      w *
        (Math.exp(home + (attack[h] as number) + (defence[a] as number)) +
          Math.exp((attack[a] as number) + (defence[h] as number)));
  }
  return settle(strengths.base, goals, expected, RATE_PRIOR_GOALS);
}

/**
 * The home advantage, from the home sides' goals.
 *
 * decisions/055-poisson-goal-model.md
 */
function settleHome(columns: Columns, strengths: Strengths): number {
  let goals = 0;
  let expected = 0;
  for (let index = 0; index < columns.weight.length; index += 1) {
    const w = columns.weight[index] as number;
    goals += w * (columns.homeGoals[index] as number);
    expected +=
      w *
      Math.exp(
        (strengths.base[columns.competition[index] as number] as number) +
          (strengths.attack[columns.homeTeam[index] as number] as number) +
          (strengths.defence[columns.awayTeam[index] as number] as number)
      );
  }
  const next = Math.log((goals + RATE_PRIOR_GOALS) / (expected + RATE_PRIOR_GOALS));
  const moved = Math.abs(next - strengths.home);
  strengths.home = next;
  return moved;
}

/**
 * Every attack, or every defence. `homeGoalsTo` names the parameter each
 * match's home goals count for and `awayGoalsTo` its away goals: the scoring
 * sides for the attacks, the conceding sides for the defences. Each is
 * measured against the `other` kind of strength of the side it faced.
 *
 * decisions/055-poisson-goal-model.md
 */
function settleSide(
  columns: Columns,
  strengths: Strengths,
  own: Float64Array,
  other: Float64Array,
  homeGoalsTo: Int32Array,
  awayGoalsTo: Int32Array
): number {
  const goals = new Float64Array(own.length);
  const expected = new Float64Array(own.length);
  for (let index = 0; index < columns.weight.length; index += 1) {
    const w = columns.weight[index] as number;
    const rate = strengths.base[columns.competition[index] as number] as number;
    const forHome = homeGoalsTo[index] as number;
    const forAway = awayGoalsTo[index] as number;
    goals[forHome] = (goals[forHome] as number) + w * (columns.homeGoals[index] as number);
    expected[forHome] =
      (expected[forHome] as number) +
      w * Math.exp(rate + strengths.home + (other[forAway] as number));
    goals[forAway] = (goals[forAway] as number) + w * (columns.awayGoals[index] as number);
    expected[forAway] =
      (expected[forAway] as number) + w * Math.exp(rate + (other[forHome] as number));
  }
  return settle(own, goals, expected, POISSON_PRIOR_MATCHES);
}

/**
 * One sweep: each kind of parameter in turn set to what makes the scores most
 * likely given the rest. Answers how far the furthest parameter moved.
 *
 * decisions/055-poisson-goal-model.md
 */
function sweep(columns: Columns, strengths: Strengths): number {
  const { attack, defence } = strengths;
  const base = settleBase(columns, strengths);
  const home = settleHome(columns, strengths);
  const attacks = settleSide(
    columns,
    strengths,
    attack,
    defence,
    columns.homeTeam,
    columns.awayTeam
  );
  const defences = settleSide(
    columns,
    strengths,
    defence,
    attack,
    columns.awayTeam,
    columns.homeTeam
  );
  return Math.max(base, home, attacks, defences);
}

/**
 * Each competition's draw factor: the one that brings the average draw
 * probability of its fitted matches, once scaled, to their draw share.
 *
 * decisions/055-poisson-goal-model.md
 */
function drawFactors(columns: Columns, strengths: Strengths): number[] {
  const tallies = Array.from(strengths.base, () => ({ draws: [] as number[], drawn: 0 }));
  for (let index = 0; index < columns.weight.length; index += 1) {
    const h = columns.homeTeam[index] as number;
    const a = columns.awayTeam[index] as number;
    const c = columns.competition[index] as number;
    const rate = strengths.base[c] as number;
    const tally = tallies[c] as { draws: number[]; drawn: number };
    tally.draws.push(
      plainDraw(
        Math.exp(
          rate + strengths.home + (strengths.attack[h] as number) + (strengths.defence[a] as number)
        ),
        Math.exp(rate + (strengths.attack[a] as number) + (strengths.defence[h] as number))
      )
    );
    tally.drawn += columns.homeGoals[index] === columns.awayGoals[index] ? 1 : 0;
  }
  return tallies.map(({ draws, drawn }) => drawFactorFor(draws, drawn / draws.length));
}

/**
 * The fit of `history`, as it stands on `day`: weighted maximum likelihood by
 * sweeps until no parameter moves, over the leagues' matches; the cups after.
 * `warm` is a nearby fit to start from, which changes only how long it takes.
 *
 * decisions/055-poisson-goal-model.md
 * decisions/059-cup-predictions.md
 */
function fitWindow(history: readonly PoissonMatch[], day: number, warm?: PoissonFit): PoissonFit {
  const leagues = history.filter((match) => !match.cup);
  const columns = columnsOf(leagues, day);
  const { codes, teams } = columns;
  const strengths: Strengths = {
    base: Float64Array.from(codes.keys(), (code) => warm?.competitions.get(code)?.base ?? 0),
    attack: Float64Array.from(teams.keys(), (team) => warm?.attack.get(team) ?? 0),
    defence: Float64Array.from(teams.keys(), (team) => warm?.defence.get(team) ?? 0),
    home: warm?.home ?? START_HOME_ADVANTAGE,
  };
  for (let sweeps = 0; sweeps < MAX_SWEEPS && leagues.length > 0; sweeps += 1) {
    if (sweep(columns, strengths) < TOLERANCE) break;
  }

  const factors = drawFactors(columns, strengths);
  const byTeam = (values: Float64Array) =>
    new Map([...teams].map(([team, index]) => [team, values[index] as number]));
  const fit: PoissonFit = {
    competitions: new Map(
      [...codes].map(([code, index]) => [
        code,
        { base: strengths.base[index] as number, drawFactor: factors[index] as number },
      ])
    ),
    home: strengths.home,
    attack: byTeam(strengths.attack),
    defence: byTeam(strengths.defence),
  };
  for (const [code, cup] of cupFits(history, fit, day)) fit.competitions.set(code, cup);
  return fit;
}

/**
 * Each cup's goal rate and draw factor, from its matches between two teams the
 * leagues' fit knows, every strength held as the leagues left it.
 *
 * decisions/059-cup-predictions.md
 */
function cupFits(
  history: readonly PoissonMatch[],
  fit: PoissonFit,
  day: number
): Map<string, { base: number; drawFactor: number; cup: true }> {
  const known = (team: number) => fit.attack.has(team);
  const byCode = new Map<string, PoissonMatch[]>();
  for (const match of history) {
    if (!match.cup || !known(match.homeTeam) || !known(match.awayTeam)) continue;
    byCode.set(match.code, [...(byCode.get(match.code) ?? []), match]);
  }

  const rates = (match: PoissonMatch) => ({
    home: Math.exp(
      fit.home +
        (fit.attack.get(match.homeTeam) as number) +
        (fit.defence.get(match.awayTeam) as number)
    ),
    away: Math.exp(
      (fit.attack.get(match.awayTeam) as number) + (fit.defence.get(match.homeTeam) as number)
    ),
  });
  const cups = new Map<string, { base: number; drawFactor: number; cup: true }>();
  for (const [code, matches] of byCode) {
    let goals = 0;
    let expected = 0;
    for (const match of matches) {
      const weight = Math.exp(-POISSON_DECAY_PER_DAY * (day - match.kickoffAt.getTime() / DAY_MS));
      const { home, away } = rates(match);
      goals += weight * (match.homeGoals + match.awayGoals);
      expected += weight * (home + away);
    }
    const base = Math.log((goals + RATE_PRIOR_GOALS) / (expected + RATE_PRIOR_GOALS));
    const draws = matches.map((match) => {
      const { home, away } = rates(match);
      return plainDraw(Math.exp(base) * home, Math.exp(base) * away);
    });
    const drawn = matches.filter((match) => match.homeGoals === match.awayGoals).length;
    cups.set(code, { base, drawFactor: drawFactorFor(draws, drawn / matches.length), cup: true });
  }
  return cups;
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
 * average side, except in a cup, where it is no prediction.
 *
 * decisions/055-poisson-goal-model.md
 * decisions/059-cup-predictions.md
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
  if (competition.cup && !(fit.attack.has(homeTeam) && fit.attack.has(awayTeam))) return null;
  const homeGoals = Math.exp(
    competition.base + fit.home + (fit.attack.get(homeTeam) ?? 0) + (fit.defence.get(awayTeam) ?? 0)
  );
  const awayGoals = Math.exp(
    competition.base + (fit.attack.get(awayTeam) ?? 0) + (fit.defence.get(homeTeam) ?? 0)
  );
  const grid = scoreGrid(homeGoals, awayGoals, competition.drawFactor);
  return {
    prediction: outcomesOf(grid),
    homeGoals,
    awayGoals,
    score: mostLikelyScore(grid),
    grid,
  };
}

/**
 * Where the UTC day of the match at `index` ends in a kickoff-ordered list:
 * the index of the first match of a later day.
 *
 * decisions/055-poisson-goal-model.md
 */
function endOfDay(ordered: readonly PoissonMatch[], index: number): number {
  const day = utcDay((ordered[index] as PoissonMatch).kickoffAt);
  let end = index;
  while (end < ordered.length && utcDay((ordered[end] as PoissonMatch).kickoffAt) === day) {
    end += 1;
  }
  return end;
}

/**
 * Every match in kickoff order, a UTC day at a time: the day's matches are all
 * predicted from one fit of the days before it. `onPredict` sees each match
 * the fit can predict. Feed one provider at a time. Given `wanted`, only the
 * days holding a wanted match are fitted, and only those matches predicted.
 *
 * decisions/055-poisson-goal-model.md
 * decisions/057-surprise-index.md
 */
export function replayPoisson(
  matches: readonly PoissonMatch[],
  onPredict: (match: PoissonMatch, prediction: PoissonPrediction) => void,
  wanted: (match: PoissonMatch) => boolean = () => true
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
    const end = endOfDay(ordered, index);
    const predicted = ordered.slice(index, end).filter(wanted);
    if (predicted.length > 0) {
      // Sorted, so the window is the run of matches ending where this day starts.
      while (!inWindow(ordered[start] as PoissonMatch, day) && start < index) start += 1;
      fit = fitWindow(ordered.slice(start, index), day, fit);
      for (const match of predicted) {
        const prediction = predictPoisson(fit, match.code, match.homeTeam, match.awayTeam);
        if (prediction !== null) onPredict(match, prediction);
      }
    }
    index = end;
  }
}
