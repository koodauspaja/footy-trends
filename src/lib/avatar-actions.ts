"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { deleteAvatar, saveAvatar } from "@/lib/avatar";
import { processAvatar } from "@/lib/avatar-image";
import type { AvatarRejection } from "@/lib/avatar-limits";
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

/**
 * The signed-in user's id, or null.
 *
 * The same rule as every other write on this page: **no action accepts a user
 * id from the client**, which removes "change someone else's picture" as a
 * category rather than checking for it. See `settings-actions.ts`.
 */
async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

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
    revalidatePath("/settings");
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
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Removing an avatar failed");
    return { ok: false };
  }
}
