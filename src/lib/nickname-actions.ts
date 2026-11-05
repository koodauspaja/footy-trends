"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { checkNickname, type NicknameRefusal } from "@/lib/nickname";
import { saveNickname } from "@/lib/nickname-store";

/**
 * Saving the signed-in user's own nickname. The rules are applied here, on the
 * server, whatever the browser sent; the user id comes from the session.
 *
 * decisions/077-nickname.md
 */

export type SaveNicknameResult =
  | { ok: true; nickname: string | null }
  | { ok: false; reason: NicknameRefusal | "taken" | "failed" };

function refused(userId: string, reason: NicknameRefusal | "taken"): SaveNicknameResult {
  logger.info({ userId, reason }, "Nickname refused");
  return { ok: false, reason };
}

export async function saveNicknameAction(raw: unknown): Promise<SaveNicknameResult> {
  let userId: string | null = null;
  try {
    userId = await currentUserId();
    if (userId === null) {
      logger.warn("Saving a nickname without a session");
      return { ok: false, reason: "failed" };
    }
    if (typeof raw !== "string") {
      logger.warn({ userId }, "Saving a nickname that is not text");
      return { ok: false, reason: "failed" };
    }

    const checked = checkNickname(raw);
    if (!checked.ok) return refused(userId, checked.reason);

    const outcome = await saveNickname(
      userId,
      checked.nickname === null ? null : { nickname: checked.nickname, key: checked.key }
    );
    if (outcome === "taken") return refused(userId, "taken");

    logger.info({ userId, outcome }, "Nickname saved");
    // The URL the user is on: `settings` is the folder behind the rewrite.
    revalidatePath("/asetukset");
    return { ok: true, nickname: checked.nickname };
  } catch (error) {
    logger.error({ err: error, userId }, "Saving a nickname failed");
    return { ok: false, reason: "failed" };
  }
}
