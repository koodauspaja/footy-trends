"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { isRegionSegment, type RegionSegment } from "@/lib/regions";

export type ActionResult = { ok: true } | { ok: false };

/**
 * The signed-in user's id, or null.
 *
 * Every write below goes through this. **No action accepts a user id from the
 * client** — that removes the whole class of "change someone else's settings"
 * rather than checking for it. See specs/024-account-settings.md.
 */
async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** Empty string from a `<select>` means "no preference", which is a real value. */
function orNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

export async function saveSettings(formData: FormData): Promise<ActionResult> {
  const userId = await currentUserId();
  if (userId === null) return { ok: false };

  const region = orNull(formData.get("defaultRegion"));
  // Validated here as well as on read: a region that is not one of the three
  // would redirect nobody, but storing it would leave a value in the database
  // that no code path can explain.
  const defaultRegion: RegionSegment | null = isRegionSegment(region) ? region : null;

  const values = {
    defaultRegion,
    defaultCompetitionDomestic: orNull(formData.get("defaultCompetitionDomestic")),
    defaultCompetitionForeign: orNull(formData.get("defaultCompetitionForeign")),
    defaultCompetitionNational: orNull(formData.get("defaultCompetitionNational")),
    updatedAt: new Date(),
  };

  try {
    // The row is created on first save rather than at sign-in, so its existence
    // means someone chose something.
    await db
      .insert(userPreferences)
      .values({ id: randomUUID(), userId, ...values })
      .onConflictDoUpdate({ target: userPreferences.userId, set: values });
  } catch (error) {
    logger.error({ err: error, userId }, "Saving settings failed");
    return { ok: false };
  }

  // The header's `Etusivu` link and every competition page read these, so a
  // stale render would contradict what the reader just saved.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOutOtherDevices(): Promise<ActionResult> {
  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
    revalidatePath("/asetukset");
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Revoking other sessions failed");
    return { ok: false };
  }
}

/**
 * Deletes the account. `user_preferences`, `session` and `account` cascade away
 * with the `user` row, so there is no half-deleted state to clean up — the
 * cascades are one transaction.
 */
export async function deleteAccount(confirmation: string): Promise<ActionResult> {
  // Belt and braces: the button is disabled until this matches, but a form can
  // be submitted without the button.
  if (confirmation.trim() !== "POISTA") return { ok: false };

  try {
    await auth.api.deleteUser({ body: {}, headers: await headers() });
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Deleting the account failed");
    return { ok: false };
  }
}

/** Exported for the settings page, which needs the row it may have just written. */
export async function currentPreferencesRow() {
  const userId = await currentUserId();
  if (userId === null) return null;

  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return row ?? null;
}
