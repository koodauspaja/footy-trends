import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { logger } from "@/lib/logger";
import { type Preferences, type RegionSegment, resolveRegion, toPreferences } from "@/lib/regions";

/**
 * The stored preferences for one user, or null when there are none.
 *
 * `cache()`d for the request: Next calls `generateMetadata` and the page
 * component separately, and both resolve the same page context, so this would
 * otherwise repeat the same lookup.
 */
export const getPreferencesFor = cache(async (userId: string): Promise<Preferences | null> => {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return row === undefined ? null : toPreferences(row);
});

/**
 * Just the start-page preference, for the session payload the browser fetches.
 *
 * Separate from `getPreferencesFor` because it runs inside better-auth's
 * `customSession` on every `/api/auth/get-session` call: reading one column and
 * swallowing failure keeps a database blip from turning a session lookup — and
 * therefore the whole header — into an error. A reader who cannot be redirected
 * simply sees the region picker, which is the app's stock behaviour.
 */
export async function getDefaultRegionFor(userId: string): Promise<RegionSegment | null> {
  try {
    const [row] = await db
      .select({ defaultRegion: userPreferences.defaultRegion })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    return row === undefined ? null : resolveRegion(row.defaultRegion);
  } catch (error) {
    logger.error({ err: error, userId }, "Reading the default region failed");
    return null;
  }
}
