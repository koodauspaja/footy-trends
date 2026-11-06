"use server";

import { currentUserId } from "@/lib/current-user";
import { parseGuess } from "@/lib/guessing-game";
import { placeSeasonGuess } from "@/lib/guessing-game-season-store";
import { joinGame, placeGuess } from "@/lib/guessing-game-store";
import { logger } from "@/lib/logger";

/**
 * Why a guess was not stored, as the row under it says it: the match has
 * started, the balance is short, the floor's guess cannot change, the price is
 * not the one shown, or anything else, which reads as a failure to retry.
 *
 * decisions/072-match-guesses.md
 */
export type GuessRefusal = "started" | "insufficient" | "free-fixed" | "price-changed" | "failed";

const TOLD: ReadonlySet<string> = new Set<GuessRefusal>([
  "started",
  "insufficient",
  "free-fixed",
  "price-changed",
]);

function isTold(reason: string): reason is Exclude<GuessRefusal, "failed"> {
  return TOLD.has(reason);
}

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
  input: unknown,
  shownPrice: unknown
): Promise<{ ok: true } | { ok: false; reason: GuessRefusal }> {
  try {
    const guess = parseGuess(input);
    if (
      !Number.isSafeInteger(providerMatchId) ||
      (providerMatchId as number) <= 0 ||
      !Number.isSafeInteger(shownPrice) ||
      (shownPrice as number) < 0 ||
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
    const outcome = await placeGuess(
      userId,
      providerMatchId as number,
      guess,
      shownPrice as number,
      () => new Date()
    );
    if (outcome.ok) return { ok: true };
    const { reason } = outcome;
    return isTold(reason) ? { ok: false, reason } : { ok: false, reason: "failed" };
  } catch (error) {
    logger.error({ err: error }, "Placing an Arvauspeli guess failed");
    return { ok: false, reason: "failed" };
  }
}

/**
 * Why a season guess was not stored, as its block says it: the season has
 * locked, the balance is short, or anything else, which reads as a failure to
 * retry.
 *
 * decisions/075-season-guesses.md
 */
export type SeasonGuessRefusalShown = "locked" | "insufficient" | "failed";

/**
 * Places or changes the signed-in player's season guess of one kind. The guess
 * comes from the browser, so the store parses it against the season's teams.
 *
 * decisions/075-season-guesses.md
 */
export async function placeSeasonGuessAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; reason: SeasonGuessRefusalShown }> {
  try {
    const userId = await currentUserId();
    if (userId === null) {
      logger.warn("Arvauspeli season guess refused: no session");
      return { ok: false, reason: "failed" };
    }
    const outcome = await placeSeasonGuess(userId, input, () => new Date());
    if (outcome.ok) return { ok: true };
    const { reason } = outcome;
    return reason === "locked" || reason === "insufficient"
      ? { ok: false, reason }
      : { ok: false, reason: "failed" };
  } catch (error) {
    logger.error({ err: error }, "Placing an Arvauspeli season guess failed");
    return { ok: false, reason: "failed" };
  }
}
