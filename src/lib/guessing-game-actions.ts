"use server";

import { currentUserId } from "@/lib/current-user";
import { parseGuess } from "@/lib/guessing-game";
import { joinGame, placeGuess } from "@/lib/guessing-game-store";
import { logger } from "@/lib/logger";

/**
 * Why a guess was not stored, as the row under it says it: the match has
 * started, the balance is short, the floor's guess cannot change, or anything
 * else, which reads as a failure to retry.
 *
 * decisions/072-match-guesses.md
 */
export type GuessRefusal = "started" | "insufficient" | "free-fixed" | "failed";

/**
 * Makes the signed-in reader an `Arvauspeli` player. No session, or a failed
 * write, answers `ok: false` and stores nothing.
 *
 * decisions/072-match-guesses.md
 */
export async function joinGameAction(): Promise<{ ok: boolean }> {
  try {
    const userId = await currentUserId();
    if (userId === null) {
      logger.warn("Arvauspeli join refused: no session");
      return { ok: false };
    }
    await joinGame(userId, new Date());
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Joining Arvauspeli failed");
    return { ok: false };
  }
}

/**
 * Makes or changes the signed-in player's guess on one match. The match id and
 * the guess come from the browser, so each is parsed before anything is read.
 *
 * decisions/072-match-guesses.md
 */
export async function placeGuessAction(
  providerMatchId: unknown,
  input: unknown
): Promise<{ ok: true } | { ok: false; reason: GuessRefusal }> {
  try {
    const guess = parseGuess(input);
    if (
      !Number.isSafeInteger(providerMatchId) ||
      (providerMatchId as number) <= 0 ||
      guess === null
    ) {
      logger.warn(
        { providerMatchId: String(providerMatchId).slice(0, 20) },
        "Arvauspeli guess refused: not a guess"
      );
      return { ok: false, reason: "failed" };
    }
    const userId = await currentUserId();
    if (userId === null) {
      logger.warn("Arvauspeli guess refused: no session");
      return { ok: false, reason: "failed" };
    }
    const outcome = await placeGuess(userId, providerMatchId as number, guess, () => new Date());
    if (outcome.ok) return { ok: true };
    const { reason } = outcome;
    return reason === "started" || reason === "insufficient" || reason === "free-fixed"
      ? { ok: false, reason }
      : { ok: false, reason: "failed" };
  } catch (error) {
    logger.error({ err: error }, "Placing an Arvauspeli guess failed");
    return { ok: false, reason: "failed" };
  }
}
