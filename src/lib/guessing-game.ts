/**
 * `Arvauspeli`'s rules, apart from any I/O: what a guess costs, what it pays,
 * what a late joiner gets, and what a guess from the browser may be.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/766-floor-by-open-prices.md
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
 * The cheapest price among a season's matches open to guesses now, or `null`
 * when none is open. The floor opens only below it.
 *
 * decisions/072-match-guesses.md
 * decisions/766-floor-by-open-prices.md
 */
export function cheapestOpenPrice(
  matches: ReadonlyArray<{ kickoffAt: Date; status: string }>,
  now: Date
): number | null {
  const prices = matches.flatMap((match) => guessPrice(match, now) ?? []);
  return prices.length === 0 ? null : Math.min(...prices);
}

/**
 * Whether the floor's free 1X2 guess is open to a player: their balance cannot
 * pay any match open now, and no guess of theirs waits to be settled.
 *
 * decisions/072-match-guesses.md
 * decisions/766-floor-by-open-prices.md
 */
export function mayUseFloor(
  balance: number,
  cheapestPrice: number | null,
  hasOpenGuess: boolean
): boolean {
  return cheapestPrice !== null && balance < cheapestPrice && !hasOpenGuess;
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
 * decisions/766-floor-by-open-prices.md
 */
export function decideGuess(input: {
  existing: { id: number; guess: Guess; free: boolean } | null;
  guess: Guess;
  price: number;
  /** The cheapest price among the season's matches open now: `cheapestOpenPrice`. */
  cheapestPrice: number | null;
  balance: number;
  hasOpenGuess: boolean;
  /** The match's kickoff has moved later since the guess was last made or changed. */
  postponed: boolean;
}): GuessDecision {
  const { existing, guess, price, cheapestPrice, balance, hasOpenGuess, postponed } = input;
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
  if (guess.kind === "outcome" && mayUseFloor(balance, cheapestPrice, hasOpenGuess)) {
    return { kind: "free" };
  }
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

/**
 * The bonus on top of a reward for a correct 1X2 few of the match's guesses
 * shared, and the counts it is judged by.
 *
 * decisions/073-leaderboard.md
 */
export const RARITY_BONUS = 20;
const RARITY_MIN_GUESSES = 5;

/**
 * How few guesses on a match show no shares: fewer could give a player's own
 * guess away.
 *
 * decisions/073-leaderboard.md
 */
const SHARES_MIN_GUESSES = 3;

const PLAYED: ReadonlySet<Settlement> = new Set<Settlement>([
  "exact",
  "difference",
  "outcome",
  "miss",
]);

/**
 * Which of one match's guesses, as settled in one go, earn the rarity bonus:
 * those whose 1X2 was right, when at most a quarter of the guesses settled as
 * played had it right and there were 5 or more. Void, refunded and awarded
 * guesses neither count nor earn it.
 *
 * decisions/073-leaderboard.md
 */
export function rarityBonuses<T>(settled: ReadonlyArray<{ key: T; settlement: Settlement }>): T[] {
  const played = settled.filter((guess) => PLAYED.has(guess.settlement));
  const right = played.filter((guess) => guess.settlement !== "miss");
  if (played.length < RARITY_MIN_GUESSES || right.length * 4 > played.length) return [];
  return right.map((guess) => guess.key);
}

/**
 * The players' guesses on one match, as whole per cents of `1`, `X` and `2`.
 *
 * decisions/073-leaderboard.md
 */
export type Shares = Readonly<Record<Outcome, number>> & { total: number };

/**
 * The shares of a match's guesses, or `null` with fewer than 3.
 *
 * decisions/073-leaderboard.md
 */
export function sharesOf(counts: Readonly<Partial<Record<Outcome, number>>>): Shares | null {
  const home = counts["1"] ?? 0;
  const draw = counts.X ?? 0;
  const away = counts["2"] ?? 0;
  const total = home + draw + away;
  if (total < SHARES_MIN_GUESSES) return null;
  const percent = (count: number) => Math.round((100 * count) / total);
  return { "1": percent(home), X: percent(draw), "2": percent(away), total };
}

/**
 * One player on a season's leaderboard, before ranking.
 *
 * decisions/073-leaderboard.md
 */
export type BoardEntry = {
  userId: string;
  /** `null` for a player with no nickname. */
  nickname: string | null;
  balance: number;
  settled: number;
};

/**
 * A row of the leaderboard as the page shows it: the rank, its place in the
 * order (1 upward, unique), and whether it is the reader's own, in place of the
 * user id.
 *
 * decisions/073-leaderboard.md
 */
export type BoardRow = Omit<BoardEntry, "userId"> & { rank: number; place: number; self: boolean };

/**
 * A season's leaderboard: its first rows, the reader's own row when it falls
 * below them, and how many players it ranks.
 *
 * decisions/073-leaderboard.md
 */
export type Board = { rows: BoardRow[]; own: BoardRow | null; players: number };

export const BOARD_ROWS = 50;

const finnish = new Intl.Collator("fi-FI");

/**
 * The leaderboard's order: balance, highest first; in a tie a nickname before
 * none, by Finnish collation; then the user id, only to keep the order stable.
 *
 * decisions/073-leaderboard.md
 */
export function byStanding(left: BoardEntry, right: BoardEntry): number {
  if (left.balance !== right.balance) return right.balance - left.balance;
  if (left.nickname === null || right.nickname === null) {
    if (left.nickname !== right.nickname) return left.nickname === null ? 1 : -1;
  } else {
    const named = finnish.compare(left.nickname, right.nickname);
    if (named !== 0) return named;
  }
  return left.userId < right.userId ? -1 : 1;
}

/**
 * Ranks a season's players by balance, highest first. An equal balance shares
 * a rank, and the next balance's rank counts every player above it.
 *
 * decisions/073-leaderboard.md
 */
export function rankBoard(entries: readonly BoardEntry[], readerId: string | null): Board {
  const sorted = entries.toSorted(byStanding);
  let rank = 0;
  const ranked = sorted.map(({ userId, ...entry }, position) => {
    if (position === 0 || sorted[position - 1]?.balance !== entry.balance) rank = position + 1;
    return { ...entry, rank, place: position + 1, self: userId === readerId };
  });
  const own = ranked.find((row) => row.self && row.place > BOARD_ROWS);
  return {
    rows: ranked.slice(0, BOARD_ROWS),
    own: own ?? null,
    players: ranked.length,
  };
}
