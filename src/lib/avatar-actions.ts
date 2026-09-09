"use server";

import { revalidatePath } from "next/cache";
import { deleteAvatar, saveAvatar } from "@/lib/avatar";
import { processAvatar } from "@/lib/avatar-image";
import type { AvatarRejection } from "@/lib/avatar-limits";
import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";

/**
 * Writing the reader's own profile picture, from specs/025-custom-avatar.md.
 *
 * A file of its own rather than another export from `settings-actions.ts`, so
 * that `sharp` is not pulled into the module every other settings write goes
 * through.
 */

export type SaveAvatarResult =
  | { ok: true; version: string }
  | { ok: false; reason: AvatarRejection | "failed" };

export type ActionResult = { ok: true } | { ok: false };

export async function saveAvatarAction(formData: FormData): Promise<SaveAvatarResult> {
  try {
    // Inside the `try`, as in `settings-actions.ts`: resolving the session
    // reads request headers and hits the database, and a failure there would
    // reject the action rather than return a result the client can render.
    const userId = await currentUserId();
    if (userId === null) return { ok: false, reason: "failed" };

    const file = formData.get("avatar");
    if (!(file instanceof File)) return { ok: false, reason: "missing" };

    const processed = await processAvatar(file);
    if (!processed.ok) return { ok: false, reason: processed.reason };

    const version = await saveAvatar(userId, processed.bytes, processed.contentType);
    // `/asetukset`, the URL the reader is actually on — the App Router folder is
    // `settings` only because `next.config.ts` rewrites it. `signOutOtherSessions`
    // in settings-actions.ts revalidates the same path for the same reason.
    revalidatePath("/asetukset");
    return { ok: true, version };
  } catch (error) {
    logger.error({ err: error }, "Storing an avatar failed");
    return { ok: false, reason: "failed" };
  }
}

export async function removeAvatarAction(): Promise<ActionResult> {
  try {
    const userId = await currentUserId();
    if (userId === null) return { ok: false };

    await deleteAvatar(userId);
    revalidatePath("/asetukset");
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Removing an avatar failed");
    return { ok: false };
  }
}
