import {
  type AnyColumn,
  and,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { db } from "@/db";
import {
  gameGuess,
  gameLedger,
  gameSeasonGuess,
  predictions,
  tasoMatches,
  userNickname,
} from "@/db/schema";
import {
  type Board,
  type BoardEntry,
  type Outcome,
  rankBoard,
  type Shares,
  sharesOf,
} from "./guessing-game";
import { favouredOutcome, GAME_MODELS, type ModelGuess } from "./guessing-game-models";
import type { GameView } from "./guessing-game-store";
import { logger } from "./logger";
import { POISSON_MODEL } from "./poisson";

/**
 * `Arvauspeli`'s reads of other players: a season's leaderboard, the shares of
 * a match's guesses, and the models' guesses. What they decide is in
 * `guessing-game.ts` and `guessing-game-models.ts`.
 *
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 */

/**
 * Every player with a guess in a season, a match's or the season's, with their
 * balance and settled count, read in one snapshot so the two agree; or only
 * those of the given users, a group's members. Ranked by `rankBoard`.
 *
 * decisions/073-leaderboard.md
 * decisions/075-season-guesses.md
 * decisions/078-private-groups.md
 */
export async function readBoardEntries(
  seasonId: number,
  userIds?: readonly string[]
): Promise<BoardEntry[]> {
  // A group's board reads its members only, not the whole season's.
  const only = (column: AnyColumn) =>
    userIds === undefined ? undefined : inArray(column, [...userIds]);
  const [matchGuesses, seasonGuesses, balances] = await db.transaction(
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
          .where(and(eq(gameGuess.seasonId, seasonId), only(gameGuess.userId)))
          .groupBy(gameGuess.userId, userNickname.nickname),
        tx
          .select({
            userId: gameSeasonGuess.userId,
            seasonSettled: count(gameSeasonGuess.settledAt),
            nickname: userNickname.nickname,
          })
          .from(gameSeasonGuess)
          .leftJoin(userNickname, eq(userNickname.userId, gameSeasonGuess.userId))
          .where(and(eq(gameSeasonGuess.seasonId, seasonId), only(gameSeasonGuess.userId)))
          .groupBy(gameSeasonGuess.userId, userNickname.nickname),
        tx
          .select({ userId: gameLedger.userId, balance: sum(gameLedger.amount).mapWith(Number) })
          .from(gameLedger)
          .where(and(eq(gameLedger.seasonId, seasonId), only(gameLedger.userId)))
          .groupBy(gameLedger.userId),
      ]),
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
  const balanceOf = new Map(balances.map((row) => [row.userId, row.balance]));
  const players = new Map<string, { userId: string; settled: number; nickname: string | null }>();
  const seasonRows = seasonGuesses.map(({ seasonSettled, ...row }) => ({
    ...row,
    settled: seasonSettled,
  }));
  for (const row of [...matchGuesses, ...seasonRows]) {
    const known = players.get(row.userId);
    players.set(row.userId, { ...row, settled: (known?.settled ?? 0) + row.settled });
  }
  return [...players.values()].map((row) => ({ ...row, balance: balanceOf.get(row.userId) ?? 0 }));
}

/**
 * A season's leaderboard for the reader: every player with a guess in it, by
 * balance.
 *
 * decisions/073-leaderboard.md
 */
export async function readBoard(seasonId: number, readerId: string): Promise<Board> {
  return rankBoard(await readBoardEntries(seasonId), readerId);
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
 * Each game model's place in the order they are shown.
 *
 * decisions/074-against-the-models.md
 */
const MODEL_ORDER: ReadonlyMap<string, number> = new Map(
  GAME_MODELS.map((model, place) => [model, place])
);

/**
 * The models' guesses on each given TASO match, from their live predictions,
 * which stop changing at kickoff. A model with no live row has no guess, and
 * neither has Poisson without its stored score.
 *
 * decisions/074-against-the-models.md
 */
export async function readModelGuesses(
  client: Pick<typeof db, "select">,
  providerMatchIds: readonly number[]
): Promise<Map<number, ModelGuess[]>> {
  if (providerMatchIds.length === 0) return new Map();
  const rows = await client
    .select({
      providerMatchId: predictions.providerMatchId,
      model: predictions.model,
      home: predictions.homeProbability,
      draw: predictions.drawProbability,
      away: predictions.awayProbability,
      homeGoals: predictions.predictedHomeGoals,
      awayGoals: predictions.predictedAwayGoals,
    })
    .from(predictions)
    .where(
      and(
        eq(predictions.source, "taso"),
        eq(predictions.kind, "live"),
        inArray(predictions.providerMatchId, [...providerMatchIds]),
        inArray(predictions.model, [...GAME_MODELS])
      )
    );
  const guesses = new Map<number, Array<ModelGuess & { place: number }>>();
  for (const row of rows) {
    const place = MODEL_ORDER.get(row.model);
    if (place === undefined) continue;
    const { homeGoals, awayGoals } = row;
    const score = homeGoals === null || awayGoals === null ? null : { homeGoals, awayGoals };
    if (row.model === POISSON_MODEL && score === null) continue;
    const match = guesses.get(row.providerMatchId) ?? [];
    match.push({ model: row.model, outcome: favouredOutcome(row), score, place });
    guesses.set(row.providerMatchId, match);
  }
  return new Map(
    [...guesses].map(([providerMatchId, match]) => [
      providerMatchId,
      match
        .toSorted((left, right) => left.place - right.place)
        .map(({ place: _place, ...guess }) => guess),
    ])
  );
}

/**
 * The season whose leaderboard a view shows: the one in play, or between
 * seasons the one just finished; none before any season is stored.
 *
 * decisions/073-leaderboard.md
 */
export function boardSeason(view: GameView): number | null {
  if (view.kind === "no-season") return null;
  return view.kind === "between" ? view.nextSeasonId - 1 : view.seasonId;
}

function kickedOffMatches(view: GameView): number[] {
  if (view.kind === "between") return view.awaiting.map((guess) => guess.providerMatchId);
  if (view.kind !== "playing") return [];
  return [...view.awaiting, ...view.settled].map((guess) => guess.providerMatchId);
}

/**
 * What `/arvauspeli` shows of other players and the models beside a reader's
 * view. Each read fails on its own, so none takes the game with it: a failed
 * board says so, and failed shares or models are left out.
 *
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 */
export async function readOthers(
  view: GameView,
  readerId: string,
  now: Date
): Promise<{
  board: Board | "error" | null;
  shares: Map<number, Shares>;
  models: Map<number, ModelGuess[]>;
}> {
  const seasonId = boardSeason(view);
  const matches = kickedOffMatches(view);
  const [board, shares, models] = await Promise.all([
    seasonId === null
      ? null
      : readBoard(seasonId, readerId).catch((error: unknown) => {
          logger.error(
            { err: error, userId: readerId, seasonId },
            "Reading the Arvauspeli leaderboard failed"
          );
          return "error" as const;
        }),
    readShares(matches, now).catch((error: unknown) => {
      logger.error({ err: error, userId: readerId }, "Reading Arvauspeli guess shares failed");
      return new Map<number, Shares>();
    }),
    readModelGuesses(db, matches).catch((error: unknown) => {
      logger.error(
        { err: error, userId: readerId },
        "Reading the models' Arvauspeli guesses failed"
      );
      return new Map<number, ModelGuess[]>();
    }),
  ]);
  return { board, shares, models };
}
