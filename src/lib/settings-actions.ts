"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { authApi, currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { isRegionSegment, type RegionSegment } from "@/lib/regions";

export type ActionResult = { ok: true } | { ok: false };

/** Empty string from a `<select>` means "no preference", which is a real value. */
function orNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

export async function saveSettings(formData: FormData): Promise<ActionResult> {
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
    // Inside the `try`, not before it: resolving the session reads request
    // headers and hits the database, and a failure there would reject the
    // server action rather than returning `{ ok: false }`. The client awaits
    // this and has no rejection handler, so the reader would be left with a
    // form that silently did nothing instead of the promised Finnish notice.
    const userId = await currentUserId();
    if (userId === null) return { ok: false };

    // The row is created on first save rather than at sign-in, so its existence
    // means someone chose something.
    await db
      .insert(userPreferences)
      .values({ id: randomUUID(), userId, ...values })
      .onConflictDoUpdate({ target: userPreferences.userId, set: values });
  } catch (error) {
    logger.error({ err: error }, "Saving settings failed");
    return { ok: false };
  }

  // The header's `Etusivu` link and every competition page read these, so a
  // stale render would contradict what the reader just saved.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOutOtherDevices(): Promise<ActionResult> {
  try {
    await (await authApi()).revokeOtherSessions({ headers: await headers() });
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
    await (await authApi()).deleteUser({ body: {}, headers: await headers() });
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Deleting the account failed");
    return { ok: false };
  }
}

/**
 * The reader's stored row for the settings page.
 *
 * Three outcomes, deliberately distinguished: the row, `null` for a reader who
 * has never saved, and `"error"` when the lookup failed. Collapsing the last
 * two would show a reader their preferences reset to defaults and let them
 * overwrite the real ones with a save — losing settings because a query
 * briefly failed. See specs/024-account-settings.md.
 */
export async function currentPreferencesRow() {
  try {
    const userId = await currentUserId();
    if (userId === null) return null;

    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    return row ?? null;
  } catch (error) {
    logger.error({ err: error }, "Reading settings failed");
    return "error" as const;
  }
}
