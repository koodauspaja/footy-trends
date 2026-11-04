import { and, asc, eq, inArray, isNotNull, isNull, max, ne, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { gameGuess, gameLedger, gamePlayer, tasoMatches } from "@/db/schema";
import {
  categoryIdForSeason,
  categoryIdsFor,
  competitionIdForSeason,
} from "./domestic-competitions";
import {
  decideGuess,
  type Guess,
  type GuessDecision,
  judge,
  nextPriceRise,
  parseGuess,
  priceAt,
  seasonGrant,
  type Tier,
} from "./guessing-game";
import { logger } from "./logger";

/**
 * `Arvauspeli`'s reads and writes: the season, the player's balance and
 * guesses, a guess in one transaction, and settling. What any of it decides
 * is in `guessing-game.ts`.
 *
 * decisions/072-match-guesses.md
 */

const COMPETITION = "VL";
const FINISHED = "FINISHED";
/** The regular season's group; any other group of a season came out of the split. */
const REGULAR_SEASON_GROUP = 1;

type Client = Pick<typeof db, "select" | "insert" | "update">;

type SeasonMatch = {
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
  /** The player's guess on it is the floor's, which cannot be changed. */
  free: boolean;
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
  homeGoals: number;
  awayGoals: number;
  tier: Tier;
  reward: number;
};

export type GameView =
  | { kind: "no-season"; joined: boolean }
  | { kind: "between"; nextSeasonId: number; joined: boolean }
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
      reason: "not-joined" | "unknown-match" | "started" | "insufficient" | "free-fixed";
    };

function seasonOf(seasonId: number) {
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
async function latestSeason(client: Client): Promise<number | null> {
  const [row] = await client
    .select({ seasonId: max(tasoMatches.seasonId) })
    .from(tasoMatches)
    .where(inArray(tasoMatches.categoryId, categoryIdsFor(COMPETITION)));
  return row?.seasonId ?? null;
}

async function seasonMatches(client: Client, seasonId: number): Promise<SeasonMatch[]> {
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

/**
 * A season is open while any of its matches is still to kick off or has no
 * result; then the page waits for the next one.
 *
 * decisions/072-match-guesses.md
 */
function isOpen(matches: readonly SeasonMatch[], now: Date): boolean {
  return matches.some((match) => match.kickoffAt > now || !hasResult(match));
}

async function grantOf(
  client: Client,
  seasonId: number,
  matches: readonly SeasonMatch[],
  joinedAt: Date
): Promise<number> {
  const splitStored = matches.some((match) => match.groupId !== REGULAR_SEASON_GROUP);
  const previous = splitStored ? 0 : await previousSplitMatches(client, seasonId);
  return seasonGrant(
    joinedAt,
    matches.map((match) => match.kickoffAt),
    splitStored,
    previous
  );
}

/**
 * Writes a player's grant for a season once; a second write, from a racing
 * request, does nothing.
 *
 * decisions/072-match-guesses.md
 */
async function ensureGrant(
  client: Client,
  userId: string,
  seasonId: number,
  matches: readonly SeasonMatch[],
  joinedAt: Date
): Promise<void> {
  const amount = await grantOf(client, seasonId, matches, joinedAt);
  const written = await client
    .insert(gameLedger)
    .values({ userId, seasonId, kind: "grant", amount })
    .onConflictDoNothing()
    .returning({ id: gameLedger.id });
  if (written.length > 0) logger.info({ userId, seasonId, amount }, "Arvauspeli grant written");
}

async function balanceOf(client: Client, userId: string, seasonId: number): Promise<number> {
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

function storedGuess(row: {
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
 * What `/arvauspeli` shows a signed-in reader. A player's grant for the open
 * season is written here when it is not yet, so a returning player has it
 * with no action of their own.
 *
 * decisions/072-match-guesses.md
 */
export async function openGame(userId: string, now: Date): Promise<GameView> {
  const [seasonId, joinedAt] = await Promise.all([latestSeason(db), joinedAtOf(db, userId)]);
  const joined = joinedAt !== null;
  if (seasonId === null) return { kind: "no-season", joined };
  const matches = await seasonMatches(db, seasonId);
  if (!isOpen(matches, now)) return { kind: "between", nextSeasonId: seasonId + 1, joined };
  if (joinedAt === null) {
    return { kind: "not-joined", seasonId, grant: await grantOf(db, seasonId, matches, now) };
  }

  await ensureGrant(db, userId, seasonId, matches, joinedAt);
  const [balance, guesses, rewards] = await Promise.all([
    balanceOf(db, userId, seasonId),
    db
      .select()
      .from(gameGuess)
      .where(and(eq(gameGuess.userId, userId), eq(gameGuess.seasonId, seasonId))),
    db
      .select({ guessId: gameLedger.guessId, amount: gameLedger.amount })
      .from(gameLedger)
      .where(
        and(
          eq(gameLedger.userId, userId),
          eq(gameLedger.seasonId, seasonId),
          eq(gameLedger.kind, "reward")
        )
      ),
  ]);
  return playingView(seasonId, now, matches, balance, guesses, rewards);
}

function playingView(
  seasonId: number,
  now: Date,
  matches: readonly SeasonMatch[],
  balance: number,
  guesses: ReadonlyArray<typeof gameGuess.$inferSelect>,
  rewards: ReadonlyArray<{ guessId: number | null; amount: number }>
): GameView {
  const byMatch = new Map(guesses.map((row) => [row.providerMatchId, row]));
  const paid = new Map(rewards.map((row) => [row.guessId, row.amount]));
  const hasOpenGuess = guesses.some((row) => row.settledAt === null);

  const upcoming: UpcomingMatch[] = [];
  const awaiting: AwaitingGuess[] = [];
  const settled: SettledGuess[] = [];
  for (const match of matches) {
    const row = byMatch.get(match.providerMatchId);
    const guess = row === undefined ? null : storedGuess(row);
    const price = priceAt(match.kickoffAt, now);
    const shown = {
      providerMatchId: match.providerMatchId,
      kickoffAt: match.kickoffAt,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
    };
    if (price !== null) {
      upcoming.push({
        ...shown,
        groupName: match.groupName,
        price,
        nextRise: nextPriceRise(match.kickoffAt, now),
        guess,
        free: row?.free ?? false,
        floor: guess === null && balance < price && !hasOpenGuess,
      });
    } else if (row !== undefined && guess !== null) {
      if (row.settledAt !== null && row.tier !== null && hasResult(match)) {
        settled.push({
          ...shown,
          guess,
          homeGoals: match.homeGoals,
          awayGoals: match.awayGoals,
          tier: row.tier as Tier,
          reward: paid.get(row.id) ?? 0,
        });
      } else {
        awaiting.push({ ...shown, guess });
      }
    }
  }
  settled.reverse();
  const groups = new Set(upcoming.map((match) => match.groupName)).size;
  return { kind: "playing", seasonId, balance, upcoming, awaiting, settled, groups };
}

/**
 * Makes a signed-in reader a player, once, and writes their grant for the open
 * season. Joining again changes nothing.
 *
 * decisions/072-match-guesses.md
 */
export async function joinGame(userId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(gamePlayer)
      .values({ userId, joinedAt: now })
      .onConflictDoNothing()
      .returning({ userId: gamePlayer.userId });
    if (inserted.length > 0) logger.info({ userId }, "Arvauspeli joined");
    const seasonId = await latestSeason(tx);
    if (seasonId === null) return;
    const matches = await seasonMatches(tx, seasonId);
    if (!isOpen(matches, now)) return;
    const joinedAt = (await joinedAtOf(tx, userId)) ?? now;
    await ensureGrant(tx, userId, seasonId, matches, joinedAt);
  });
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
 * Makes or changes a player's guess on one match, with its ledger row, in one
 * transaction. The player's row is locked first, so two guesses sent at once
 * are decided one after the other and never spend the same tokens.
 *
 * decisions/072-match-guesses.md
 */
export async function placeGuess(
  userId: string,
  providerMatchId: number,
  guess: Guess,
  now: Date
): Promise<GuessOutcome> {
  return db.transaction(async (tx) => {
    const [player] = await tx
      .select({ joinedAt: gamePlayer.joinedAt })
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, userId))
      .for("update");
    if (player === undefined) return refused(userId, providerMatchId, guess, "not-joined");

    const [match] = await tx
      .select({
        seasonId: tasoMatches.seasonId,
        competitionCode: tasoMatches.competitionCode,
        categoryId: tasoMatches.categoryId,
        kickoffAt: tasoMatches.kickoffAt,
      })
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, providerMatchId));
    if (match === undefined || !isGameMatch(match)) {
      return refused(userId, providerMatchId, guess, "unknown-match");
    }
    const price = priceAt(match.kickoffAt, now);
    if (price === null) return refused(userId, providerMatchId, guess, "started");

    const { seasonId } = match;
    await ensureGrant(tx, userId, seasonId, await seasonMatches(tx, seasonId), player.joinedAt);
    const balance = await balanceOf(tx, userId, seasonId);
    const guesses = await tx
      .select()
      .from(gameGuess)
      .where(and(eq(gameGuess.userId, userId), eq(gameGuess.seasonId, seasonId)));
    const existing = guesses.find((row) => row.providerMatchId === providerMatchId);
    const decision = decideGuess({
      existing:
        existing === undefined
          ? null
          : { id: existing.id, guess: storedGuess(existing), free: existing.free },
      guess,
      price,
      balance,
      hasOpenGuess: guesses.some((row) => row.settledAt === null),
    });
    if (decision.kind === "refused") {
      return refused(userId, providerMatchId, guess, decision.reason);
    }
    await write(tx, { userId, seasonId, providerMatchId, guess, now, decision });
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
    decision: Exclude<GuessDecision, { kind: "refused" }>;
  }
): Promise<void> {
  const { userId, seasonId, providerMatchId, guess, now, decision } = input;
  if (decision.kind === "unchanged") return;
  if (decision.kind === "change") {
    await client
      .update(gameGuess)
      .set({ ...guessColumns(guess), madeAt: now })
      .where(eq(gameGuess.id, decision.guessId));
    await client.insert(gameLedger).values({
      userId,
      seasonId,
      kind: "change",
      amount: -decision.price,
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
  /** TASO match ids whose guesses could not be settled this run. */
  failed: number[];
};

/**
 * Settles every open guess whose match is finished with a score, one match per
 * transaction, and pays each by the reward table. A settled guess is never
 * settled again: the update is conditional and a second reward fails.
 *
 * decisions/072-match-guesses.md
 */
export async function settleGuesses(now: Date): Promise<SettleReport> {
  const rows = await db
    .select({
      id: gameGuess.id,
      userId: gameGuess.userId,
      seasonId: gameGuess.seasonId,
      providerMatchId: gameGuess.providerMatchId,
      kind: gameGuess.kind,
      outcome: gameGuess.outcome,
      homeGoals: gameGuess.homeGoals,
      awayGoals: gameGuess.awayGoals,
      // Not null: the filter below requires both.
      resultHome: sql<number>`${tasoMatches.homeGoals}`.mapWith(Number),
      resultAway: sql<number>`${tasoMatches.awayGoals}`.mapWith(Number),
    })
    .from(gameGuess)
    .innerJoin(tasoMatches, eq(tasoMatches.providerMatchId, gameGuess.providerMatchId))
    .where(
      and(
        isNull(gameGuess.settledAt),
        eq(tasoMatches.status, FINISHED),
        isNotNull(tasoMatches.homeGoals),
        isNotNull(tasoMatches.awayGoals)
      )
    );

  const byMatch = Map.groupBy(rows, (row) => row.providerMatchId);
  const report: SettleReport = { matches: 0, rewarded: 0, missed: 0, failed: [] };
  for (const [providerMatchId, guesses] of byMatch) {
    try {
      const counts = await db.transaction(async (tx) => {
        let rewarded = 0;
        let missed = 0;
        for (const row of guesses) {
          const { tier, reward } = judge(storedGuess(row), row.resultHome, row.resultAway);
          const updated = await tx
            .update(gameGuess)
            .set({ settledAt: now, tier })
            .where(and(eq(gameGuess.id, row.id), isNull(gameGuess.settledAt)))
            .returning({ id: gameGuess.id });
          if (updated.length === 0) continue;
          await tx.insert(gameLedger).values({
            userId: row.userId,
            seasonId: row.seasonId,
            kind: "reward",
            amount: reward,
            guessId: row.id,
          });
          if (reward > 0) rewarded += 1;
          else missed += 1;
        }
        return { rewarded, missed };
      });
      report.matches += 1;
      report.rewarded += counts.rewarded;
      report.missed += counts.missed;
    } catch (error) {
      logger.error({ err: error, providerMatchId }, "Unable to settle Arvauspeli guesses");
      report.failed.push(providerMatchId);
    }
  }
  logger.info(report, "Arvauspeli guesses settled");
  return report;
}
