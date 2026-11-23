"use server";

import { revalidatePath } from "next/cache";
import { deleteAvatar } from "@/lib/account/avatar";
import { currentUserId } from "@/lib/auth/current-user";
import { logger } from "@/lib/platform/logger";

/**
 * Removing the reader's own profile picture. Uploading one is the route
 * `/api/avatar/me`, which can cap the body as it streams.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */

export type ActionResult = { ok: true } | { ok: false };

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
