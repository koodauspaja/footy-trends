/**
 * `Arvauspeli`'s reads and writes: the season, the player's balance and
 * guesses, a guess in one transaction, and settling. What any of it decides
 * is in `guessing-game.ts`.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/766-floor-by-open-prices.md
 */

import { and, asc, eq, inArray, isNull, lte, max, ne, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { gameGuess, gameLedger, gamePlayer, tasoMatches } from "@/db/schema";
import {
  categoryIdForSeason,
  categoryIdsFor,
  competitionIdForSeason,
} from "./domestic-competitions";
import {
  cheapestOpenPrice,
  decideGuess,
  type Guess,
  type GuessDecision,
  guessPrice,
  mayUseFloor,
  nextPriceRise,
  parseGuess,
  RARITY_BONUS,
  rarityBonuses,
  type Settlement,
  type SettlingMatch,
  seasonGrant,
  settlementOf,
} from "./guessing-game";
import { readModelGuesses } from "./guessing-game-board";
import { MODEL_REWARD, modelsBeaten } from "./guessing-game-models";
import { logger } from "./logger";

export const COMPETITION = "VL";
export const FINISHED = "FINISHED";
/** The regular season's group; any other group of a season came out of the split. */
export const REGULAR_SEASON_GROUP = 1;

export type Client = Pick<typeof db, "select" | "insert" | "update">;

export type SeasonMatch = {
  providerMatchId: number;
  groupId: number;
  groupName: string;
  kickoffAt: Date;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

export type UpcomingMatch = {
  providerMatchId: number;
  groupName: string;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  price: number;
  nextRise: { price: number; at: Date } | null;
  guess: Guess | null;
  /** The player's guess on it is the floor's free 1X2: changed only after a postponement, and as a 1X2. */
  free: boolean;
  /** The kickoff has moved later since the player's guess: its next change is free. */
  postponed: boolean;
  /** No paid guess is affordable, and the floor's free 1X2 is open. */
  floor: boolean;
};

export type AwaitingGuess = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  guess: Guess;
};

export type SettledGuess = AwaitingGuess & {
  /** The result it was judged against; null when it was refunded, or awarded with no score. */
  homeGoals: number | null;
  awayGoals: number | null;
  settlement: Settlement;
  /** What it paid back: a reward, or a refund of everything paid on it. */
  reward: number;
  /** The rarity bonus paid on top, or 0. */
  bonus: number;
  /** What beating the models paid, or 0. */
  modelsReward: number;
};

export type GameView =
  | { kind: "no-season"; joined: boolean }
  | { kind: "between"; nextSeasonId: number; joined: boolean; awaiting: AwaitingGuess[] }
  | { kind: "not-joined"; seasonId: number; grant: number }
  | {
      kind: "playing";
      seasonId: number;
      balance: number;
      upcoming: UpcomingMatch[];
      awaiting: AwaitingGuess[];
      settled: SettledGuess[];
      /** Groups among the upcoming matches: their names show only when there are several. */
      groups: number;
    };

export type GuessOutcome =
  | { ok: true; decision: Exclude<GuessDecision, { kind: "refused" }> }
  | {
      ok: false;
      reason:
        | "not-joined"
        | "unknown-match"
        | "started"
        | "settled"
        | "insufficient"
        | "free-fixed"
        | "price-changed";
    };

/**
 * A Veikkausliiga season's stored matches, under the codes it is stored under.
 *
 * decisions/072-match-guesses.md
 */
export function seasonOf(seasonId: number) {
  return and(
    eq(tasoMatches.seasonId, seasonId),
    eq(tasoMatches.competitionCode, competitionIdForSeason(COMPETITION, seasonId)),
    eq(tasoMatches.categoryId, categoryIdForSeason(COMPETITION, seasonId))
  );
}

const MATCH_COLUMNS = {
  providerMatchId: tasoMatches.providerMatchId,
  groupId: tasoMatches.groupId,
  groupName: tasoMatches.groupName,
  kickoffAt: tasoMatches.kickoffAt,
  status: tasoMatches.status,
  homeTeamName: tasoMatches.homeTeamName,
  awayTeamName: tasoMatches.awayTeamName,
  homeGoals: tasoMatches.homeGoals,
  awayGoals: tasoMatches.awayGoals,
};

/**
 * Whether a stored match is Veikkausliiga's, of the season it is stored under.
 *
 * decisions/072-match-guesses.md
 */
function isGameMatch(match: { seasonId: number; competitionCode: string; categoryId: string }) {
  return (
    match.competitionCode === competitionIdForSeason(COMPETITION, match.seasonId) &&
    match.categoryId === categoryIdForSeason(COMPETITION, match.seasonId)
  );
}

function hasResult(
  match: SeasonMatch
): match is SeasonMatch & { homeGoals: number; awayGoals: number } {
  return match.status === FINISHED && match.homeGoals !== null && match.awayGoals !== null;
}

/**
 * The newest Veikkausliiga season stored, or `null` when none is.
 *
 * decisions/072-match-guesses.md
 */
export async function latestSeason(client: Client): Promise<number | null> {
  const [row] = await client
    .select({ seasonId: max(tasoMatches.seasonId) })
    .from(tasoMatches)
    .where(inArray(tasoMatches.categoryId, categoryIdsFor(COMPETITION)));
  return row?.seasonId ?? null;
}

export async function seasonMatches(client: Client, seasonId: number): Promise<SeasonMatch[]> {
  return client
    .select(MATCH_COLUMNS)
    .from(tasoMatches)
    .where(seasonOf(seasonId))
    .orderBy(asc(tasoMatches.kickoffAt), asc(tasoMatches.providerMatchId));
}

/**
 * The previous season's matches outside its regular season, which stand in for
 * a split not stored yet.
 *
 * decisions/072-match-guesses.md
 */
async function previousSplitMatches(client: Client, seasonId: number): Promise<number> {
  const [row] = await client
    .select({ count: sql<number>`count(*)::int` })
    .from(tasoMatches)
    .where(and(seasonOf(seasonId - 1), ne(tasoMatches.groupId, REGULAR_SEASON_GROUP)));
  return row?.count ?? 0;
}

export type Season = {
  seasonId: number;
  matches: SeasonMatch[];
  splitStored: boolean;
  /** The previous season's split matches, counted while this season's are not stored. */
  previousSplit: number;
};

export async function seasonOfId(client: Client, seasonId: number): Promise<Season> {
  const matches = await seasonMatches(client, seasonId);
  const splitStored = matches.some((match) => match.groupId !== REGULAR_SEASON_GROUP);
  const previousSplit = splitStored ? 0 : await previousSplitMatches(client, seasonId);
  return { seasonId, matches, splitStored, previousSplit };
}

/**
 * A season is open while any of its matches is still to kick off or has no
 * result, or while a split the previous season had is not stored yet; then the
 * page waits for the next one.
 *
 * decisions/072-match-guesses.md
 */
function isOpen(season: Season, now: Date): boolean {
  if (!season.splitStored && season.previousSplit > 0) return true;
  return season.matches.some((match) => match.kickoffAt > now || !hasResult(match));
}

function grantOf(season: Season, joinedAt: Date): number {
  return seasonGrant(
    joinedAt,
    season.matches.map((match) => match.kickoffAt),
    season.splitStored,
    season.previousSplit
  );
}

/**
 * Writes a player's grant for a season once; a second write, from a racing
 * request, does nothing.
 *
 * decisions/072-match-guesses.md
 */
export async function ensureGrant(
  client: Client,
  userId: string,
  season: Season,
  joinedAt: Date
): Promise<void> {
  const amount = grantOf(season, joinedAt);
  const written = await client
    .insert(gameLedger)
    .values({ userId, seasonId: season.seasonId, kind: "grant", amount })
    .onConflictDoNothing()
    .returning({ id: gameLedger.id });
  if (written.length > 0) {
    logger.info({ userId, seasonId: season.seasonId, amount }, "Arvauspeli grant written");
  }
}

export async function balanceOf(client: Client, userId: string, seasonId: number): Promise<number> {
  const [row] = await client
    .select({ balance: sum(gameLedger.amount).mapWith(Number) })
    .from(gameLedger)
    .where(and(eq(gameLedger.userId, userId), eq(gameLedger.seasonId, seasonId)));
  return row?.balance ?? 0;
}

async function joinedAtOf(client: Client, userId: string): Promise<Date | null> {
  const [row] = await client
    .select({ joinedAt: gamePlayer.joinedAt })
    .from(gamePlayer)
    .where(eq(gamePlayer.userId, userId));
  return row?.joinedAt ?? null;
}

/**
 * A stored guess row as the guess it holds, for the player's own page and a
 * group's alike.
 *
 * decisions/072-match-guesses.md
 * decisions/079-group-members-guesses.md
 */
export function storedGuess(row: {
  kind: string;
  outcome: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
}): Guess {
  const guess = parseGuess(row);
  // Only this module writes guesses, and only parsed ones: anything else is a
  // fault to surface, not a guess to show.
  if (guess === null) throw new Error("A stored Arvauspeli guess is not a guess");
  return guess;
}

/**
 * A player's guesses still waiting to be settled, in every season, with their
 * matches: the floor's "open guess", and the page's `Odottavat tulosta`. A
 * guess whose match is no longer stored still counts.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
function openGuessesOf(client: Client, userId: string) {
  return client
    .select({
      providerMatchId: gameGuess.providerMatchId,
      seasonId: gameGuess.seasonId,
      kind: gameGuess.kind,
      outcome: gameGuess.outcome,
      homeGoals: gameGuess.homeGoals,
      awayGoals: gameGuess.awayGoals,
      kickoffAt: tasoMatches.kickoffAt,
      homeTeamName: tasoMatches.homeTeamName,
      awayTeamName: tasoMatches.awayTeamName,
    })
    .from(gameGuess)
    .leftJoin(tasoMatches, eq(tasoMatches.providerMatchId, gameGuess.providerMatchId))
    .where(and(eq(gameGuess.userId, userId), isNull(gameGuess.settledAt)))
    .orderBy(asc(tasoMatches.kickoffAt));
}

function awaitingOf(rows: Awaited<ReturnType<typeof openGuessesOf>>, now: Date): AwaitingGuess[] {
  return rows.flatMap(({ kickoffAt, homeTeamName, awayTeamName, ...row }) =>
    // A guess whose match is gone has nothing to name; it waits unlisted.
    kickoffAt === null || homeTeamName === null || awayTeamName === null || kickoffAt > now
      ? []
      : [
          {
            providerMatchId: row.providerMatchId,
            kickoffAt,
            homeTeamName,
            awayTeamName,
            guess: storedGuess(row),
          },
        ]
  );
}

/**
 * What `/arvauspeli` shows a signed-in reader. A player's grant for the open
 * season is written here when it is not yet, so a returning player has it
 * with no action of their own; then everything shown is read in one snapshot.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
export async function openGame(userId: string, now: Date): Promise<GameView> {
  const [seasonId, joinedAt] = await Promise.all([latestSeason(db), joinedAtOf(db, userId)]);
  const joined = joinedAt !== null;
  if (seasonId === null) return { kind: "no-season", joined };
  const season = await seasonOfId(db, seasonId);
  const open = isOpen(season, now);
  if (joinedAt === null) {
    return open
      ? { kind: "not-joined", seasonId, grant: grantOf(season, now) }
      : { kind: "between", nextSeasonId: seasonId + 1, joined, awaiting: [] };
  }

  if (open) await ensureGrant(db, userId, season, joinedAt);
  const [balance, guesses, rewards, openGuesses] = await db.transaction(
    (tx) =>
      Promise.all([
        balanceOf(tx, userId, seasonId),
        tx
          .select()
          .from(gameGuess)
          .where(and(eq(gameGuess.userId, userId), eq(gameGuess.seasonId, seasonId))),
        tx
          .select({ guessId: gameLedger.guessId, amount: gameLedger.amount, kind: gameLedger.kind })
          .from(gameLedger)
          .where(
            and(
              eq(gameLedger.userId, userId),
              eq(gameLedger.seasonId, seasonId),
              inArray(gameLedger.kind, [...PAYMENT_KINDS])
            )
          ),
        openGuessesOf(tx, userId),
      ]),
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
  const awaiting = awaitingOf(openGuesses, now);
  // A season ends once its last match is settled, not only once it has a result.
  const settling = openGuesses.some((row) => row.seasonId === seasonId);
  if (!open && !settling) return { kind: "between", nextSeasonId: seasonId + 1, joined, awaiting };
  return playingView(season, now, balance, guesses, rewards, {
    awaiting,
    hasOpenGuess: openGuesses.length > 0,
  });
}

/**
 * What a settlement's ledger rows paid on each guess, by guess id: the reward
 * or refund, the rarity bonus, and the models' reward. The player's own page
 * and a group's page read a guess's payments alike.
 *
 * decisions/072-match-guesses.md
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 * decisions/079-group-members-guesses.md
 */
export function paymentsOf(
  rows: ReadonlyArray<{ guessId: number | null; amount: number; kind: string }>
): {
  paid: Map<number | null, number>;
  bonuses: Map<number | null, number>;
  models: Map<number | null, number>;
} {
  // A reward or a refund is what is not paid on top of one.
  const onTop = new Set<string>(PAID_ON_TOP);
  const byKind = (keep: (kind: string) => boolean) =>
    new Map(rows.filter((row) => keep(row.kind)).map((row) => [row.guessId, row.amount]));
  return {
    paid: byKind((kind) => !onTop.has(kind)),
    bonuses: byKind((kind) => kind === "bonus"),
    models: byKind((kind) => kind === "models"),
  };
}

/**
 * What a guess's settlement paid on top of its reward or refund.
 *
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 */
const PAID_ON_TOP = ["bonus", "models"] as const;

/**
 * The ledger kinds a settled guess's payments are read from.
 *
 * decisions/079-group-members-guesses.md
 */
export const PAYMENT_KINDS = ["reward", "refund", ...PAID_ON_TOP] as const;

/**
 * What a settled guess paid, as its lines say it: how it was settled, its
 * reward or refund, the rarity bonus and the models' reward.
 *
 * decisions/072-match-guesses.md
 * decisions/079-group-members-guesses.md
 */
export type Paid = { settlement: Settlement; reward: number; bonus: number; modelsReward: number };

function playingView(
  season: Season,
  now: Date,
  balance: number,
  guesses: ReadonlyArray<typeof gameGuess.$inferSelect>,
  rewards: ReadonlyArray<{ guessId: number | null; amount: number; kind: string }>,
  open: { awaiting: AwaitingGuess[]; hasOpenGuess: boolean }
): GameView {
  const byMatch = new Map(guesses.map((row) => [row.providerMatchId, row]));
  const { paid, bonuses, models: modelRewardsPaid } = paymentsOf(rewards);
  const floor = mayUseFloor(balance, cheapestOpenPrice(season.matches, now), open.hasOpenGuess);

  const upcoming: UpcomingMatch[] = [];
  const settled: Array<SettledGuess & { settledAt: Date }> = [];
  for (const match of season.matches) {
    const row = byMatch.get(match.providerMatchId);
    const guess = row === undefined ? null : storedGuess(row);
    const price = guessPrice(match, now);
    const shown = {
      providerMatchId: match.providerMatchId,
      kickoffAt: match.kickoffAt,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
    };
    if (price !== null && row?.settledAt == null) {
      upcoming.push({
        ...shown,
        groupName: match.groupName,
        price,
        nextRise: nextPriceRise(match.kickoffAt, now),
        guess,
        free: row?.free ?? false,
        postponed: row !== undefined && match.kickoffAt > row.kickoffAt,
        floor: guess === null && floor,
      });
      continue;
    }
    const judged = row === undefined ? null : settledResult(row);
    if (judged !== null && guess !== null) {
      const { id, ...result } = judged;
      settled.push({
        ...shown,
        ...result,
        guess,
        reward: paid.get(id) ?? 0,
        bonus: bonuses.get(id) ?? 0,
        modelsReward: modelRewardsPaid.get(id) ?? 0,
      });
    }
  }
  // Newest settlement first; a match's kickoff decides a tie.
  settled.sort(
    (left, right) =>
      right.settledAt.getTime() - left.settledAt.getTime() ||
      right.kickoffAt.getTime() - left.kickoffAt.getTime()
  );
  const groups = new Set(upcoming.map((match) => match.groupName)).size;
  return {
    kind: "playing",
    seasonId: season.seasonId,
    balance,
    upcoming,
    awaiting: open.awaiting,
    settled: settled.map(({ settledAt: _settledAt, ...rest }) => rest),
    groups,
  };
}

/**
 * How a guess was settled and the result it was judged against, as stored
 * when it was settled, or `null` while it is open. A refund, and an award with
 * no score, have no result.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
export function settledResult(row: typeof gameGuess.$inferSelect) {
  const { id, settledAt, tier, resultHomeGoals, resultAwayGoals } = row;
  if (settledAt === null || tier === null) return null;
  const scored = resultHomeGoals !== null && resultAwayGoals !== null;
  return {
    id,
    settledAt,
    settlement: tier as Settlement,
    homeGoals: scored ? resultHomeGoals : null,
    awayGoals: scored ? resultAwayGoals : null,
  };
}

/**
 * Makes a signed-in reader a player, once, and writes their grant for the open
 * season. Joining again changes nothing.
 *
 * decisions/072-match-guesses.md
 */
export async function joinGame(userId: string, now: Date): Promise<void> {
  await db.transaction((tx) => joinGameIn(tx, userId, now));
}

/**
 * `joinGame` inside a transaction of the caller's, so joining a group by its
 * link joins the game in the same write, or neither.
 *
 * decisions/072-match-guesses.md
 * decisions/078-private-groups.md
 */
export async function joinGameIn(tx: Client, userId: string, now: Date): Promise<void> {
  const inserted = await tx
    .insert(gamePlayer)
    .values({ userId, joinedAt: now })
    .onConflictDoNothing()
    .returning({ userId: gamePlayer.userId });
  if (inserted.length > 0) logger.info({ userId }, "Arvauspeli joined");
  const seasonId = await latestSeason(tx);
  if (seasonId === null) return;
  const season = await seasonOfId(tx, seasonId);
  if (!isOpen(season, now)) return;
  const joinedAt = (await joinedAtOf(tx, userId)) ?? now;
  await ensureGrant(tx, userId, season, joinedAt);
}

function refused(
  userId: string,
  providerMatchId: number,
  guess: Guess,
  reason: Extract<GuessOutcome, { ok: false }>["reason"]
): GuessOutcome {
  logger.info({ userId, providerMatchId, kind: guess.kind, reason }, "Arvauspeli guess refused");
  return { ok: false, reason };
}

/**
 * Makes or changes a player's guess on one match of the season the page shows,
 * with its ledger row, in one transaction. The player's row is locked first, so
 * two guesses sent at once are decided one after the other and never spend the
 * same tokens, and the clock is read once the lock is held. A guess whose price
 * is no longer the one the page showed is refused, never charged.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/766-floor-by-open-prices.md
 */
export async function placeGuess(
  userId: string,
  providerMatchId: number,
  guess: Guess,
  shownPrice: number,
  clock: () => Date
): Promise<GuessOutcome> {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select({ joinedAt: gamePlayer.joinedAt })
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, userId))
      .for("update");
    if (player === undefined) return refused(userId, providerMatchId, guess, "not-joined");
    const now = clock();

    const [match] = await tx
      .select({
        seasonId: tasoMatches.seasonId,
        competitionCode: tasoMatches.competitionCode,
        categoryId: tasoMatches.categoryId,
        kickoffAt: tasoMatches.kickoffAt,
        status: tasoMatches.status,
      })
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, providerMatchId));
    if (match === undefined || !isGameMatch(match) || match.seasonId !== (await latestSeason(tx))) {
      return refused(userId, providerMatchId, guess, "unknown-match");
    }
    const price = guessPrice(match, now);
    if (price === null) return refused(userId, providerMatchId, guess, "started");

    const { seasonId } = match;
    const season = await seasonOfId(tx, seasonId);
    await ensureGrant(tx, userId, season, player.joinedAt);
    const balance = await balanceOf(tx, userId, seasonId);
    const [existing] = await tx
      .select()
      .from(gameGuess)
      .where(and(eq(gameGuess.userId, userId), eq(gameGuess.providerMatchId, providerMatchId)));
    const openGuesses = await openGuessesOf(tx, userId);
    if (existing?.settledAt != null) return refused(userId, providerMatchId, guess, "settled");
    const decision = decideGuess({
      existing:
        existing === undefined
          ? null
          : { id: existing.id, guess: storedGuess(existing), free: existing.free },
      guess,
      price,
      cheapestPrice: cheapestOpenPrice(season.matches, now),
      balance,
      hasOpenGuess: openGuesses.length > 0,
      postponed: existing !== undefined && match.kickoffAt > existing.kickoffAt,
    });
    if (decision.kind === "refused") {
      return refused(userId, providerMatchId, guess, decision.reason);
    }
    if (decision.kind !== "unchanged" && costOf(decision) !== shownPrice) {
      return refused(userId, providerMatchId, guess, "price-changed");
    }
    await write(tx, {
      userId,
      seasonId,
      providerMatchId,
      guess,
      now,
      kickoffAt: match.kickoffAt,
      decision,
    });
    logger.info(
      {
        userId,
        providerMatchId,
        kind: guess.kind,
        outcome: decision.kind,
        price: costOf(decision),
      },
      "Arvauspeli guess written"
    );
    return { ok: true, decision };
  });
}

function costOf(decision: Exclude<GuessDecision, { kind: "refused" }>): number {
  return decision.kind === "new" || decision.kind === "change" ? decision.price : 0;
}

function guessColumns(guess: Guess) {
  return guess.kind === "outcome"
    ? { kind: guess.kind, outcome: guess.outcome, homeGoals: null, awayGoals: null }
    : { kind: guess.kind, outcome: null, homeGoals: guess.homeGoals, awayGoals: guess.awayGoals };
}

/**
 * The one row a single-row insert returns; any other count is a fault.
 *
 * decisions/072-match-guesses.md
 */
export function single<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined || rows.length !== 1)
    throw new Error(`Expected one row, got ${rows.length}`);
  return row;
}

async function write(
  client: Client,
  input: {
    userId: string;
    seasonId: number;
    providerMatchId: number;
    guess: Guess;
    now: Date;
    /** The stored kickoff the guess is made against. */
    kickoffAt: Date;
    decision: Exclude<GuessDecision, { kind: "refused" }>;
  }
): Promise<void> {
  const { userId, seasonId, providerMatchId, guess, now, kickoffAt, decision } = input;
  if (decision.kind === "unchanged") return;
  if (decision.kind === "change") {
    await client
      .update(gameGuess)
      .set({ ...guessColumns(guess), madeAt: now, kickoffAt })
      .where(eq(gameGuess.id, decision.guessId));
    await client.insert(gameLedger).values({
      userId,
      seasonId,
      kind: "change",
      amount: 0 - decision.price,
      guessId: decision.guessId,
    });
    return;
  }
  const inserted = single(
    await client
      .insert(gameGuess)
      .values({
        userId,
        seasonId,
        providerMatchId,
        ...guessColumns(guess),
        free: decision.kind === "free",
        madeAt: now,
        kickoffAt,
      })
      .returning({ id: gameGuess.id })
  );
  await client.insert(gameLedger).values({
    userId,
    seasonId,
    kind: "guess",
    amount: 0 - costOf(decision),
    guessId: inserted.id,
  });
}

export type SettleReport = {
  matches: number;
  rewarded: number;
  missed: number;
  /** Refunded for an abandoned match, or an awarded one TASO decided nothing for. */
  refunded: number;
  /** Refunded for having been made after a kickoff that moved earlier. */
  voided: number;
  /** Rarity bonuses paid on top of rewards. */
  bonuses: number;
  /** Guesses paid for beating one or more models. */
  modelWins: number;
  /** TASO match ids whose guesses could not be settled this run. */
  failed: number[];
};

/**
 * The statuses a match still waiting may have; any other is named in a `warn`.
 * An abandoned match never waits.
 *
 * decisions/076-guesses-on-irregular-matches.md
 */
const KNOWN_STATUSES: ReadonlySet<string> = new Set([FINISHED, "SCHEDULED"]);

/**
 * How long after kickoff a match with guesses may wait for its result before a
 * `warn` names it.
 *
 * decisions/076-guesses-on-irregular-matches.md
 */
const RESULT_WAIT_MS = 48 * 60 * 60 * 1000;

type SettleRow = {
  id: number;
  userId: string;
  seasonId: number;
  providerMatchId: number;
  kind: string;
  outcome: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  madeAt: Date;
};

type Settling = { row: SettleRow; outcome: NonNullable<ReturnType<typeof settlementOf>> };

/**
 * What everything paid on a guess comes to, its guess and its changes, as a
 * positive amount: what a refund pays back.
 *
 * decisions/076-guesses-on-irregular-matches.md
 */
async function paidOn(client: Client, guessId: number): Promise<number> {
  const [row] = await client
    .select({ paid: sum(gameLedger.amount).mapWith(Number) })
    .from(gameLedger)
    .where(and(eq(gameLedger.guessId, guessId), inArray(gameLedger.kind, ["guess", "change"])));
  return 0 - (row?.paid ?? 0);
}

type SettledHere = {
  outcome: Settling["outcome"];
  amount: number;
  bonus: number;
  /** What beating the models paid, or 0. */
  models: number;
};

/**
 * What each guess a match's transaction settled as played earned against the
 * models, read from the match's live predictions; nothing when none was played.
 *
 * decisions/074-against-the-models.md
 */
async function modelRewards(
  tx: Client,
  settled: ReadonlyArray<{ row: SettleRow; outcome: Settling["outcome"] }>
): Promise<Map<SettleRow, number>> {
  const played = settled.flatMap(({ row, outcome }) =>
    outcome.kind === "reward" && outcome.settlement !== "awarded" && outcome.result !== null
      ? [{ row, result: outcome.result }]
      : []
  );
  const first = played[0];
  if (first === undefined) return new Map();
  const models =
    (await readModelGuesses(tx, [first.row.providerMatchId])).get(first.row.providerMatchId) ?? [];
  return new Map(
    played.map(({ row, result }) => [
      row,
      MODEL_REWARD * modelsBeaten(storedGuess(row), result, models),
    ])
  );
}

/**
 * Settles one match's guesses in one transaction, `null` for a guess another
 * run settled first, and pays the rarity bonus and the models' reward on those
 * this one settled.
 * Players are locked first, the order a guess and an account's deletion take
 * them in, so neither waits on the other.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 */
async function settleMatch(
  guesses: readonly Settling[],
  now: Date
): Promise<Array<SettledHere | null>> {
  const players = [...new Set(guesses.map(({ row }) => row.userId))];
  return db.transaction(async (tx) => {
    await tx
      .select({ userId: gamePlayer.userId })
      .from(gamePlayer)
      .where(inArray(gamePlayer.userId, players))
      .orderBy(asc(gamePlayer.userId))
      .for("share");
    const paid = await Promise.all(
      guesses.map(async ({ row, outcome }) => {
        const result = outcome.kind === "reward" ? outcome.result : null;
        const updated = await tx
          .update(gameGuess)
          .set({
            settledAt: now,
            tier: outcome.settlement,
            resultHomeGoals: result?.homeGoals ?? null,
            resultAwayGoals: result?.awayGoals ?? null,
          })
          .where(and(eq(gameGuess.id, row.id), isNull(gameGuess.settledAt)))
          .returning({ id: gameGuess.id });
        if (updated.length === 0) return null;
        const amount = outcome.kind === "reward" ? outcome.reward : await paidOn(tx, row.id);
        await tx.insert(gameLedger).values({
          userId: row.userId,
          seasonId: row.seasonId,
          kind: outcome.kind,
          amount,
          guessId: row.id,
        });
        return { outcome, amount };
      })
    );
    const settledHere = guesses.filter((_guess, index) => paid[index] !== null);
    const earning = new Set(
      rarityBonuses(
        settledHere.map(({ row, outcome }) => ({ key: row, settlement: outcome.settlement }))
      )
    );
    const beaten = await modelRewards(tx, settledHere);
    await Promise.all(
      [...earning].map((row) =>
        tx.insert(gameLedger).values({
          userId: row.userId,
          seasonId: row.seasonId,
          kind: "bonus",
          amount: RARITY_BONUS,
          guessId: row.id,
        })
      )
    );
    const rewarded = [...beaten].filter(([, amount]) => amount > 0);
    await Promise.all(
      rewarded.map(([row, amount]) =>
        tx.insert(gameLedger).values({
          userId: row.userId,
          seasonId: row.seasonId,
          kind: "models",
          amount,
          guessId: row.id,
        })
      )
    );
    return guesses.map(({ row }, index) => {
      const settled = paid[index] ?? null;
      if (settled === null) return null;
      return {
        ...settled,
        bonus: earning.has(row) ? RARITY_BONUS : 0,
        models: beaten.get(row) ?? 0,
      };
    });
  });
}

/**
 * Why a match's guesses still wait, when a `warn` should name it: gone from
 * the store, a status not seen before, or no result 48 hours after kickoff.
 * `null` when waiting is still ordinary.
 *
 * decisions/076-guesses-on-irregular-matches.md
 */
function waitingReason(match: SettlingMatch | null, now: Date): string | null {
  if (match === null) return "not stored";
  if (!KNOWN_STATUSES.has(match.status)) return "unknown status";
  return now.getTime() - match.kickoffAt.getTime() >= RESULT_WAIT_MS ? "no result" : null;
}

/**
 * Every open guess whose match has kicked off, or is no longer stored, with
 * what settling reads of the match.
 *
 * decisions/076-guesses-on-irregular-matches.md
 */
function openSettlingRows(now: Date) {
  return db
    .select({
      id: gameGuess.id,
      userId: gameGuess.userId,
      seasonId: gameGuess.seasonId,
      providerMatchId: gameGuess.providerMatchId,
      kind: gameGuess.kind,
      outcome: gameGuess.outcome,
      homeGoals: gameGuess.homeGoals,
      awayGoals: gameGuess.awayGoals,
      madeAt: gameGuess.madeAt,
      stored: tasoMatches.providerMatchId,
      status: tasoMatches.status,
      providerStatus: tasoMatches.providerStatus,
      kickoffAt: tasoMatches.kickoffAt,
      resultHome: tasoMatches.homeGoals,
      resultAway: tasoMatches.awayGoals,
      winner: tasoMatches.winner,
    })
    .from(gameGuess)
    .leftJoin(tasoMatches, eq(tasoMatches.providerMatchId, gameGuess.providerMatchId))
    .where(
      and(
        isNull(gameGuess.settledAt),
        or(isNull(tasoMatches.providerMatchId), lte(tasoMatches.kickoffAt, now))
      )
    );
}

type SettlingRead = Awaited<ReturnType<typeof openSettlingRows>>[number];

function settlingMatchOf(read: SettlingRead): SettlingMatch | null {
  const { stored, status, providerStatus, kickoffAt, resultHome, resultAway, winner } = read;
  if (stored === null || status === null || kickoffAt === null) return null;
  return {
    status,
    providerStatus,
    kickoffAt,
    homeGoals: resultHome,
    awayGoals: resultAway,
    winner,
  };
}

/**
 * The open guesses settling read that can be settled now, each with its
 * outcome; a match whose guesses still wait for a reason worth a look is named
 * in a `warn`, once.
 *
 * decisions/076-guesses-on-irregular-matches.md
 */
function settleableOf(rows: ReadonlyArray<SettlingRead>, now: Date): Settling[] {
  const settleable: Settling[] = [];
  const waiting = new Map<number, string>();
  for (const read of rows) {
    const { stored, status, providerStatus, kickoffAt, resultHome, resultAway, winner, ...row } =
      read;
    const match = settlingMatchOf(read);
    const outcome = match === null ? null : settlementOf(storedGuess(row), row.madeAt, match);
    if (outcome !== null) {
      settleable.push({ row, outcome });
      continue;
    }
    const reason = waitingReason(match, now);
    if (reason !== null && !waiting.has(row.providerMatchId)) {
      waiting.set(row.providerMatchId, reason);
      logger.warn(
        { providerMatchId: row.providerMatchId, status, kickoffAt, reason },
        "Arvauspeli guesses still waiting"
      );
    }
  }
  return settleable;
}

/**
 * Settles every open guess `settlementOf` can decide, each match in its own
 * transaction, all at once. A settled guess is never settled again: the update
 * is conditional and a second settlement fails.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
export async function settleGuesses(now: Date): Promise<SettleReport> {
  const rows = await openSettlingRows(now);
  const settleable = settleableOf(rows, now);
  const settled = await Promise.all(
    [...Map.groupBy(settleable, ({ row }) => row.providerMatchId)].map(
      ([providerMatchId, guesses]) =>
        settleMatch(guesses, now).then(
          (paid) => ({ providerMatchId, paid }),
          (error: unknown) => {
            logger.error({ err: error, providerMatchId }, "Unable to settle Arvauspeli guesses");
            return { providerMatchId, paid: null };
          }
        )
    )
  );
  const report = reportOf(settled);
  logger.info(report, "Arvauspeli guesses settled");
  return report;
}

function reportOf(
  settled: ReadonlyArray<{
    providerMatchId: number;
    paid: Array<SettledHere | null> | null;
  }>
): SettleReport {
  const report: SettleReport = {
    matches: 0,
    rewarded: 0,
    missed: 0,
    refunded: 0,
    voided: 0,
    bonuses: 0,
    modelWins: 0,
    failed: [],
  };
  for (const { providerMatchId, paid } of settled) {
    if (paid === null) {
      report.failed.push(providerMatchId);
      continue;
    }
    report.matches += 1;
    for (const settledGuess of paid) {
      if (settledGuess !== null) count(report, settledGuess);
    }
  }
  return report;
}

function count(report: SettleReport, { outcome, amount, bonus, models }: SettledHere) {
  if (bonus > 0) report.bonuses += 1;
  if (models > 0) report.modelWins += 1;
  if (outcome.settlement === "void") report.voided += 1;
  else if (outcome.kind === "refund") report.refunded += 1;
  else if (amount > 0) report.rewarded += 1;
  else report.missed += 1;
}
