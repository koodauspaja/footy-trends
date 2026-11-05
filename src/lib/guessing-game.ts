/**
 * `Arvauspeli`'s rules, apart from any I/O: what a guess costs, what it pays,
 * what a late joiner gets, and what a guess from the browser may be.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */

export type Outcome = "1" | "X" | "2";

export type Guess =
  | { kind: "outcome"; outcome: Outcome }
  | { kind: "score"; homeGoals: number; awayGoals: number };

/**
 * The highest tier a settled guess reached; `miss` reached none.
 *
 * decisions/072-match-guesses.md
 */
export type Tier = "exact" | "difference" | "outcome" | "miss";

export const STARTING_BALANCE = 1000;

/**
 * The most goals one side can be guessed to score: two digits.
 *
 * decisions/072-match-guesses.md
 */
export const MAX_GUESSED_GOALS = 99;

const HOUR_MS = 60 * 60 * 1000;

/**
 * The price by hours before the stored kickoff: the first step whose hours the
 * time left reaches, and under 24 hours the last day's price.
 *
 * decisions/072-match-guesses.md
 */
const PRICE_STEPS = [
  { fromHours: 168, price: 10 },
  { fromHours: 72, price: 15 },
  { fromHours: 24, price: 20 },
] as const;
const LAST_DAY_PRICE = 30;

/**
 * The cheapest a guess can be. The floor opens only below it.
 *
 * decisions/072-match-guesses.md
 */
export const LOWEST_PRICE = PRICE_STEPS[0].price;

const OUTCOMES: ReadonlySet<string> = new Set<Outcome>(["1", "X", "2"]);

/**
 * What a guess made at `now` costs, either kind, or `null` once the match has
 * kicked off: a guess locks at kickoff.
 *
 * decisions/072-match-guesses.md
 */
export function priceAt(kickoffAt: Date, now: Date): number | null {
  const left = kickoffAt.getTime() - now.getTime();
  if (left <= 0) return null;
  return PRICE_STEPS.find((step) => left >= step.fromHours * HOUR_MS)?.price ?? LAST_DAY_PRICE;
}

/**
 * What a guess on a match costs now, or `null` once it is closed: kicked off,
 * or already decided by TASO, a walkover or an abandonment before its kickoff.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
export function guessPrice(match: { kickoffAt: Date; status: string }, now: Date): number | null {
  if (match.status === "FINISHED" || match.status === "Abandoned") return null;
  return priceAt(match.kickoffAt, now);
}

/**
 * When the price rises next and to what, or `null` in the last 24 hours, when
 * it is already at its highest.
 *
 * decisions/072-match-guesses.md
 */
export function nextPriceRise(kickoffAt: Date, now: Date): { price: number; at: Date } | null {
  const left = kickoffAt.getTime() - now.getTime();
  const index = PRICE_STEPS.findIndex((step) => left >= step.fromHours * HOUR_MS);
  const step = PRICE_STEPS[index];
  if (step === undefined) return null;
  return {
    price: PRICE_STEPS[index + 1]?.price ?? LAST_DAY_PRICE,
    at: new Date(kickoffAt.getTime() - step.fromHours * HOUR_MS),
  };
}

/**
 * The 1X2 a result is: `1` a home win, `X` a draw, `2` an away win.
 *
 * decisions/072-match-guesses.md
 */
export function outcomeOf(homeGoals: number, awayGoals: number): Outcome {
  if (homeGoals > awayGoals) return "1";
  return homeGoals < awayGoals ? "2" : "X";
}

/**
 * The reward table, by the guess's kind and the tier it reached. A score
 * guess's 1X2 tier pays less than a 1X2 guess, so a 1X2 guess has a point.
 *
 * decisions/072-match-guesses.md
 */
const REWARDS: Readonly<Record<Guess["kind"], Readonly<Record<Tier, number>>>> = {
  outcome: { exact: 0, difference: 0, outcome: 30, miss: 0 },
  score: { exact: 100, difference: 40, outcome: 20, miss: 0 },
};

/**
 * A guess against a result: the highest tier it reached and what it pays. A
 * score guess is judged exact, then goal difference, then 1X2; a draw guessed
 * as another draw has the goal difference.
 *
 * decisions/072-match-guesses.md
 */
export function judge(
  guess: Guess,
  homeGoals: number,
  awayGoals: number
): { tier: Tier; reward: number } {
  const tier = tierOf(guess, homeGoals, awayGoals);
  return { tier, reward: REWARDS[guess.kind][tier] };
}

function tierOf(guess: Guess, homeGoals: number, awayGoals: number): Tier {
  const result = outcomeOf(homeGoals, awayGoals);
  if (guess.kind === "outcome") return guess.outcome === result ? "outcome" : "miss";
  if (guess.homeGoals === homeGoals && guess.awayGoals === awayGoals) return "exact";
  if (guess.homeGoals - guess.awayGoals === homeGoals - awayGoals) return "difference";
  return outcomeOf(guess.homeGoals, guess.awayGoals) === result ? "outcome" : "miss";
}

/**
 * A late joiner's grant: the starting balance times the share of the season's
 * matches not yet kicked off, rounded down. A season with no match counted
 * yet gives the whole balance.
 *
 * decisions/072-match-guesses.md
 */
export function lateJoinShare(remaining: number, total: number): number {
  if (total <= 0 || remaining >= total) return STARTING_BALANCE;
  return Math.floor((STARTING_BALANCE * Math.max(remaining, 0)) / total);
}

/**
 * Whether the floor's free 1X2 guess is open to a player: their balance cannot
 * pay even the cheapest guess, and no guess of theirs waits to be settled.
 *
 * decisions/072-match-guesses.md
 */
export function mayUseFloor(balance: number, hasOpenGuess: boolean): boolean {
  return balance < LOWEST_PRICE && !hasOpenGuess;
}

/**
 * Whether two guesses say the same thing, so a change between them would
 * change nothing.
 *
 * decisions/072-match-guesses.md
 */
export function sameGuess(left: Guess, right: Guess): boolean {
  if (left.kind === "outcome") return right.kind === "outcome" && left.outcome === right.outcome;
  return (
    right.kind === "score" &&
    left.homeGoals === right.homeGoals &&
    left.awayGoals === right.awayGoals
  );
}

function isGoalCount(value: unknown): value is number {
  return (
    Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_GUESSED_GOALS
  );
}

/**
 * A guess as the browser sent it, or `null` for anything that is not exactly
 * one: an outcome of `1`, `X` or `2`, or two whole goal counts from 0 to 99.
 *
 * decisions/072-match-guesses.md
 */
export function parseGuess(input: unknown): Guess | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as Record<string, unknown>;
  if (candidate.kind === "outcome") {
    const { outcome } = candidate;
    return typeof outcome === "string" && OUTCOMES.has(outcome)
      ? { kind: "outcome", outcome: outcome as Outcome }
      : null;
  }
  if (candidate.kind === "score") {
    const { homeGoals, awayGoals } = candidate;
    return isGoalCount(homeGoals) && isGoalCount(awayGoals)
      ? { kind: "score", homeGoals, awayGoals }
      : null;
  }
  return null;
}

/**
 * A player's grant for a season: the whole balance if they joined before its
 * first kickoff, else S14's share. Before the split, the split groups' matches
 * are counted as the previous season had them, all still to come.
 *
 * decisions/072-match-guesses.md
 */
export function seasonGrant(
  joinedAt: Date,
  kickoffs: readonly Date[],
  splitStored: boolean,
  previousSplitMatches: number
): number {
  const unstored = splitStored ? 0 : previousSplitMatches;
  const remaining = kickoffs.filter((kickoffAt) => kickoffAt > joinedAt).length;
  return lateJoinShare(remaining + unstored, kickoffs.length + unstored);
}

export type GuessDecision =
  | { kind: "new"; price: number }
  | { kind: "free" }
  | { kind: "change"; price: number; guessId: number }
  | { kind: "unchanged" }
  | { kind: "refused"; reason: "insufficient" | "free-fixed" };

/**
 * What a guess on an open match does: the same guess changes nothing; a change
 * is free after a postponement (the floor's stays a 1X2), else paid, the
 * floor's refused; a new one is paid, or is the floor's free 1X2.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
export function decideGuess(input: {
  existing: { id: number; guess: Guess; free: boolean } | null;
  guess: Guess;
  price: number;
  balance: number;
  hasOpenGuess: boolean;
  /** The match's kickoff has moved later since the guess was last made or changed. */
  postponed: boolean;
}): GuessDecision {
  const { existing, guess, price, balance, hasOpenGuess, postponed } = input;
  if (existing !== null) {
    if (sameGuess(existing.guess, guess)) return { kind: "unchanged" };
    // The floor's guess stays a 1X2, postponed or not.
    if (postponed && (!existing.free || guess.kind === "outcome")) {
      return { kind: "change", price: 0, guessId: existing.id };
    }
    if (existing.free) return { kind: "refused", reason: "free-fixed" };
    return balance >= price
      ? { kind: "change", price, guessId: existing.id }
      : { kind: "refused", reason: "insufficient" };
  }
  if (balance >= price) return { kind: "new", price };
  if (guess.kind === "outcome" && mayUseFloor(balance, hasOpenGuess)) return { kind: "free" };
  return { kind: "refused", reason: "insufficient" };
}

/**
 * How a settled guess was settled: a played match's tier, or one of 076's
 * irregular cases.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
export type Settlement = Tier | "awarded" | "abandoned" | "undecided" | "void";

/**
 * What settling reads of a match: its stored status, TASO's own, the kickoff,
 * the score, and TASO's `winner`.
 *
 * decisions/076-guesses-on-irregular-matches.md
 */
export type SettlingMatch = {
  status: string;
  providerStatus: string | null;
  kickoffAt: Date;
  homeGoals: number | null;
  awayGoals: number | null;
  winner: "home" | "away" | "tie" | null;
};

export type SettlementOutcome =
  | {
      kind: "reward";
      settlement: Settlement;
      reward: number;
      result: { homeGoals: number; awayGoals: number } | null;
    }
  | { kind: "refund"; settlement: "abandoned" | "undecided" | "void" };

const WINNER_OUTCOMES: Readonly<Record<"home" | "away" | "tie", Outcome>> = {
  home: "1",
  away: "2",
  tie: "X",
};

/**
 * An awarded match: every score guess pays as exact, a 1X2 guess as usual
 * against the awarded score, or TASO's `winner` when it recorded none, and
 * with neither every guess is refunded.
 *
 * decisions/076-guesses-on-irregular-matches.md
 */
function awarded(guess: Guess, match: SettlingMatch): SettlementOutcome {
  const result = scoreOf(match);
  let decided: Outcome | null = null;
  if (result !== null) decided = outcomeOf(result.homeGoals, result.awayGoals);
  else if (match.winner !== null) decided = WINNER_OUTCOMES[match.winner];
  if (decided === null) return { kind: "refund", settlement: "undecided" };
  let reward = REWARDS.score.exact;
  if (guess.kind === "outcome") reward = guess.outcome === decided ? REWARDS.outcome.outcome : 0;
  return { kind: "reward", settlement: "awarded", reward, result };
}

function scoreOf(match: SettlingMatch): { homeGoals: number; awayGoals: number } | null {
  const { homeGoals, awayGoals } = match;
  return homeGoals === null || awayGoals === null ? null : { homeGoals, awayGoals };
}

/**
 * How a guess on a match that has kicked off is settled, or `null` while it
 * waits: void if made at or after the kickoff, refunded if abandoned, then by
 * `awarded` or a played match's tiers.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
export function settlementOf(
  guess: Guess,
  madeAt: Date,
  match: SettlingMatch
): SettlementOutcome | null {
  if (madeAt >= match.kickoffAt) return { kind: "refund", settlement: "void" };
  if (match.status === "Abandoned") return { kind: "refund", settlement: "abandoned" };
  if (match.providerStatus === "Forfeited") return awarded(guess, match);
  const result = scoreOf(match);
  if (match.status !== "FINISHED" || result === null) return null;
  const { tier, reward } = judge(guess, result.homeGoals, result.awayGoals);
  return { kind: "reward", settlement: tier, reward, result };
}
