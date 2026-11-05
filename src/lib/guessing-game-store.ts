/**
 * `Arvauspeli`'s reads and writes: the season, the player's balance and
 * guesses, a guess in one transaction, and settling. What any of it decides
 * is in `guessing-game.ts`.
 *
 * decisions/072-match-guesses.md
 */

import { and, asc, eq, inArray, isNotNull, isNull, lte, max, ne, sql, sum } from "drizzle-orm";
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
  mayUseFloor,
  nextPriceRise,
  parseGuess,
  priceAt,
  seasonGrant,
  type Tier,
} from "./guessing-game";
import { logger } from "./logger";

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

type Season = {
  seasonId: number;
  matches: SeasonMatch[];
  splitStored: boolean;
  /** The previous season's split matches, counted while this season's are not stored. */
  previousSplit: number;
};

async function seasonOfId(client: Client, seasonId: number): Promise<Season> {
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
async function ensureGrant(
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
 * A player's guesses still waiting to be settled, in every season, with their
 * matches: the floor's "open guess", and the page's `Odottavat tulosta`.
 *
 * decisions/072-match-guesses.md
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
    .innerJoin(tasoMatches, eq(tasoMatches.providerMatchId, gameGuess.providerMatchId))
    .where(and(eq(gameGuess.userId, userId), isNull(gameGuess.settledAt)))
    .orderBy(asc(tasoMatches.kickoffAt));
}

function awaitingOf(rows: Awaited<ReturnType<typeof openGuessesOf>>, now: Date): AwaitingGuess[] {
  return rows
    .filter((row) => row.kickoffAt <= now)
    .map((row) => ({
      providerMatchId: row.providerMatchId,
      kickoffAt: row.kickoffAt,
      homeTeamName: row.homeTeamName,
      awayTeamName: row.awayTeamName,
      guess: storedGuess(row),
    }));
}

/**
 * What `/arvauspeli` shows a signed-in reader. A player's grant for the open
 * season is written here when it is not yet, so a returning player has it
 * with no action of their own; then everything shown is read in one snapshot.
 *
 * decisions/072-match-guesses.md
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
          .select({ guessId: gameLedger.guessId, amount: gameLedger.amount })
          .from(gameLedger)
          .where(
            and(
              eq(gameLedger.userId, userId),
              eq(gameLedger.seasonId, seasonId),
              eq(gameLedger.kind, "reward")
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

function playingView(
  season: Season,
  now: Date,
  balance: number,
  guesses: ReadonlyArray<typeof gameGuess.$inferSelect>,
  rewards: ReadonlyArray<{ guessId: number | null; amount: number }>,
  open: { awaiting: AwaitingGuess[]; hasOpenGuess: boolean }
): GameView {
  const byMatch = new Map(guesses.map((row) => [row.providerMatchId, row]));
  const paid = new Map(rewards.map((row) => [row.guessId, row.amount]));

  const upcoming: UpcomingMatch[] = [];
  const settled: Array<SettledGuess & { settledAt: Date }> = [];
  for (const match of season.matches) {
    const row = byMatch.get(match.providerMatchId);
    const guess = row === undefined ? null : storedGuess(row);
    const price = priceAt(match.kickoffAt, now);
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
        floor: guess === null && mayUseFloor(balance, open.hasOpenGuess),
      });
      continue;
    }
    const judged = row === undefined ? null : settledResult(row);
    if (judged !== null && guess !== null) {
      const { id, ...result } = judged;
      settled.push({ ...shown, ...result, guess, reward: paid.get(id) ?? 0 });
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
 * A settled guess's judgement and the result it was judged against, as stored
 * when it was settled, or `null` while it is open.
 *
 * decisions/072-match-guesses.md
 */
function settledResult(row: typeof gameGuess.$inferSelect) {
  const { id, settledAt, tier, resultHomeGoals, resultAwayGoals } = row;
  if (settledAt === null || tier === null || resultHomeGoals === null || resultAwayGoals === null) {
    return null;
  }
  return {
    id,
    settledAt,
    tier: tier as Tier,
    homeGoals: resultHomeGoals,
    awayGoals: resultAwayGoals,
  };
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
    const season = await seasonOfId(tx, seasonId);
    if (!isOpen(season, now)) return;
    const joinedAt = (await joinedAtOf(tx, userId)) ?? now;
    await ensureGrant(tx, userId, season, joinedAt);
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
 * Makes or changes a player's guess on one match of the season the page shows,
 * with its ledger row, in one transaction. The player's row is locked first, so
 * two guesses sent at once are decided one after the other and never spend the
 * same tokens, and the clock is read once the lock is held. A guess whose price
 * is no longer the one the page showed is refused, never charged.
 *
 * decisions/072-match-guesses.md
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
      })
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, providerMatchId));
    if (match === undefined || !isGameMatch(match) || match.seasonId !== (await latestSeason(tx))) {
      return refused(userId, providerMatchId, guess, "unknown-match");
    }
    const price = priceAt(match.kickoffAt, now);
    if (price === null) return refused(userId, providerMatchId, guess, "started");

    const { seasonId } = match;
    await ensureGrant(tx, userId, await seasonOfId(tx, seasonId), player.joinedAt);
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
      balance,
      hasOpenGuess: openGuesses.length > 0,
    });
    if (decision.kind === "refused") {
      return refused(userId, providerMatchId, guess, decision.reason);
    }
    if (decision.kind !== "unchanged" && costOf(decision) !== shownPrice) {
      return refused(userId, providerMatchId, guess, "price-changed");
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

type SettleRow = {
  id: number;
  userId: string;
  seasonId: number;
  kind: string;
  outcome: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  resultHome: number;
  resultAway: number;
};

/**
 * Settles one match's guesses in one transaction: what each paid, or `null`
 * for a guess another run settled first. The players' rows are locked first,
 * the order a guess and an account's deletion take them in, so neither waits
 * on the other in a cycle.
 *
 * decisions/072-match-guesses.md
 */
async function settleMatch(
  guesses: readonly SettleRow[],
  now: Date
): Promise<Array<number | null>> {
  const players = [...new Set(guesses.map((row) => row.userId))];
  return db.transaction(async (tx) => {
    await tx
      .select({ userId: gamePlayer.userId })
      .from(gamePlayer)
      .where(inArray(gamePlayer.userId, players))
      .orderBy(asc(gamePlayer.userId))
      .for("share");
    return Promise.all(
      guesses.map(async (row) => {
        const { tier, reward } = judge(storedGuess(row), row.resultHome, row.resultAway);
        const updated = await tx
          .update(gameGuess)
          .set({
            settledAt: now,
            tier,
            resultHomeGoals: row.resultHome,
            resultAwayGoals: row.resultAway,
          })
          .where(and(eq(gameGuess.id, row.id), isNull(gameGuess.settledAt)))
          .returning({ id: gameGuess.id });
        if (updated.length === 0) return null;
        await tx.insert(gameLedger).values({
          userId: row.userId,
          seasonId: row.seasonId,
          kind: "reward",
          amount: reward,
          guessId: row.id,
        });
        return reward;
      })
    );
  });
}

/**
 * Settles every open guess whose match has kicked off and finished with a
 * score, each match in its own transaction, all at once, by the reward table. A
 * settled guess is never settled again: the update is conditional and a second
 * reward fails.
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
        lte(tasoMatches.kickoffAt, now),
        eq(tasoMatches.status, FINISHED),
        isNotNull(tasoMatches.homeGoals),
        isNotNull(tasoMatches.awayGoals)
      )
    );

  const settled = await Promise.all(
    [...Map.groupBy(rows, (row) => row.providerMatchId)].map(([providerMatchId, guesses]) =>
      settleMatch(guesses, now).then(
        (rewards) => ({ providerMatchId, rewards }),
        (error: unknown) => {
          logger.error({ err: error, providerMatchId }, "Unable to settle Arvauspeli guesses");
          return { providerMatchId, rewards: null };
        }
      )
    )
  );
  const report: SettleReport = { matches: 0, rewarded: 0, missed: 0, failed: [] };
  for (const { providerMatchId, rewards } of settled) {
    if (rewards === null) {
      report.failed.push(providerMatchId);
      continue;
    }
    report.matches += 1;
    for (const reward of rewards) {
      if (reward === null) continue;
      if (reward > 0) report.rewarded += 1;
      else report.missed += 1;
    }
  }
  logger.info(report, "Arvauspeli guesses settled");
  return report;
}
