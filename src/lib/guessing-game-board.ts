import { and, count, eq, inArray, isNotNull, isNull, lt, lte, ne, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { gameGuess, gameLedger, tasoMatches, userNickname } from "@/db/schema";
import { type Board, type Outcome, rankBoard, type Shares, sharesOf } from "./guessing-game";
import type { GameView } from "./guessing-game-store";
import { logger } from "./logger";

/**
 * `Arvauspeli`'s reads of other players: a season's leaderboard and the shares
 * of a match's guesses. What either decides is in `guessing-game.ts`.
 *
 * decisions/073-leaderboard.md
 */

/**
 * A season's leaderboard for the reader: every player with a guess in it, by
 * balance, read in one snapshot so a balance and its settled count agree.
 *
 * decisions/073-leaderboard.md
 */
export async function readBoard(seasonId: number, readerId: string): Promise<Board> {
  const [guessed, balances] = await db.transaction(
    (tx) =>
      Promise.all([
        tx
          .select({
            userId: gameGuess.userId,
            settled: count(gameGuess.settledAt),
            nickname: userNickname.nickname,
          })
          .from(gameGuess)
          .leftJoin(userNickname, eq(userNickname.userId, gameGuess.userId))
          .where(eq(gameGuess.seasonId, seasonId))
          .groupBy(gameGuess.userId, userNickname.nickname),
        tx
          .select({ userId: gameLedger.userId, balance: sum(gameLedger.amount).mapWith(Number) })
          .from(gameLedger)
          .where(eq(gameLedger.seasonId, seasonId))
          .groupBy(gameLedger.userId),
      ]),
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
  const balanceOf = new Map(balances.map((row) => [row.userId, row.balance]));
  return rankBoard(
    guessed.map((row) => ({ ...row, balance: balanceOf.get(row.userId) ?? 0 })),
    readerId
  );
}

/**
 * The 1X2 a stored guess says, in SQL: a score guess's by its goals.
 *
 * decisions/073-leaderboard.md
 */
const GUESSED_OUTCOME = sql<string>`case
  when ${gameGuess.kind} = 'outcome' then ${gameGuess.outcome}
  when ${gameGuess.homeGoals} > ${gameGuess.awayGoals} then '1'
  when ${gameGuess.homeGoals} < ${gameGuess.awayGoals} then '2'
  else 'X' end`;

/**
 * The settlements that count in the shares: a played match's and an awarded
 * one's. A refunded or void guess does not.
 *
 * decisions/073-leaderboard.md
 */
const COUNTED_SETTLEMENTS = ["exact", "difference", "outcome", "miss", "awarded"];

/**
 * The shares of the guesses on each given match that has kicked off, for those
 * with enough guesses to show. A guess still open counts unless it will be
 * refunded: made at or after the stored kickoff, or on an abandoned match.
 *
 * decisions/073-leaderboard.md
 */
export async function readShares(
  providerMatchIds: readonly number[],
  now: Date
): Promise<Map<number, Shares>> {
  if (providerMatchIds.length === 0) return new Map();
  const rows = await db
    .select({
      providerMatchId: gameGuess.providerMatchId,
      outcome: GUESSED_OUTCOME,
      guesses: count(),
    })
    .from(gameGuess)
    .innerJoin(tasoMatches, eq(tasoMatches.providerMatchId, gameGuess.providerMatchId))
    .where(
      and(
        inArray(gameGuess.providerMatchId, [...providerMatchIds]),
        lte(tasoMatches.kickoffAt, now),
        or(
          and(
            isNull(gameGuess.settledAt),
            lt(gameGuess.madeAt, tasoMatches.kickoffAt),
            ne(tasoMatches.status, "Abandoned")
          ),
          and(isNotNull(gameGuess.settledAt), inArray(gameGuess.tier, COUNTED_SETTLEMENTS))
        )
      )
    )
    .groupBy(gameGuess.providerMatchId, GUESSED_OUTCOME);
  const counts = new Map<number, Partial<Record<Outcome, number>>>();
  for (const row of rows) {
    const match = counts.get(row.providerMatchId) ?? {};
    match[row.outcome as Outcome] = row.guesses;
    counts.set(row.providerMatchId, match);
  }
  const shares = new Map<number, Shares>();
  for (const [providerMatchId, match] of counts) {
    const shown = sharesOf(match);
    if (shown !== null) shares.set(providerMatchId, shown);
  }
  return shares;
}

/**
 * The season whose leaderboard a view shows: the one in play, or between
 * seasons the one just finished; none before any season is stored.
 *
 * decisions/073-leaderboard.md
 */
function boardSeason(view: GameView): number | null {
  if (view.kind === "no-season") return null;
  return view.kind === "between" ? view.nextSeasonId - 1 : view.seasonId;
}

function kickedOffMatches(view: GameView): number[] {
  if (view.kind === "between") return view.awaiting.map((guess) => guess.providerMatchId);
  if (view.kind !== "playing") return [];
  return [...view.awaiting, ...view.settled].map((guess) => guess.providerMatchId);
}

/**
 * What `/arvauspeli` shows of other players beside a reader's view. Each read
 * fails on its own, so neither takes the game with it: a failed board says so,
 * and failed shares are left out.
 *
 * decisions/073-leaderboard.md
 */
export async function readOthers(
  view: GameView,
  readerId: string,
  now: Date
): Promise<{ board: Board | "error" | null; shares: Map<number, Shares> }> {
  const seasonId = boardSeason(view);
  const [board, shares] = await Promise.all([
    seasonId === null
      ? null
      : readBoard(seasonId, readerId).catch((error: unknown) => {
          logger.error(
            { err: error, userId: readerId, seasonId },
            "Reading the Arvauspeli leaderboard failed"
          );
          return "error" as const;
        }),
    readShares(kickedOffMatches(view), now).catch((error: unknown) => {
      logger.error({ err: error, userId: readerId }, "Reading Arvauspeli guess shares failed");
      return new Map<number, Shares>();
    }),
  ]);
  return { board, shares };
}
