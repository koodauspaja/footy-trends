/**
 * Settling `Arvauspeli`'s guesses once their matches have a result: each
 * match's guesses paid or voided in one transaction, and a report of the run.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/766-floor-by-open-prices.md
 * decisions/816-split-by-job.md
 */

import { and, asc, eq, inArray, isNull, lte, or, sum } from "drizzle-orm";
import { db } from "@/db";
import { gameGuess, gameLedger, gamePlayer, tasoMatches } from "@/db/schema";
import { logger } from "../platform/logger";
import { RARITY_BONUS, rarityBonuses, type SettlingMatch, settlementOf } from "./guessing-game";
import { readModelGuesses } from "./guessing-game-board";
import { MODEL_REWARD, modelsBeaten } from "./guessing-game-models";
import { type Client, FINISHED, storedGuess } from "./guessing-game-store";

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
