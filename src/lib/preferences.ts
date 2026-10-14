import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { user, userAvatar, userPreferences } from "@/db/schema";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/admin-role";
import { favouritesForSession } from "@/lib/favourites";
import { logger } from "@/lib/logger";
import { type Preferences, type RegionSegment, resolveRegion, toPreferences } from "@/lib/regions";

/**
 * The stored preferences for one user, or null when there are none. `cache()`d
 * for the request.
 *
 * decisions/024-account-settings.md
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
 * What the browser needs from the session beyond better-auth's own fields.
 * `avatarVersion` is the avatar's random cache token, or null when the reader
 * has no custom picture.
 *
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 * decisions/026-favourites.md
 * decisions/028-admin-tools-and-roles.md
 */
export type SessionExtras = {
  defaultRegion: RegionSegment | null;
  avatarVersion: string | null;
  /**
   * The reader's favourites as keys, for the client toggle on pages that stay
   * prerendered.
   */
  favoriteTeams: string[];
  favoriteCompetitions: string[];
  /**
   * The reader's role, so the account menu can decide whether to offer the
   * `Ylläpito` link. Not an authorisation: `requireAdmin()` is what refuses.
   */
  role: Role;
};

const NO_EXTRAS: SessionExtras = {
  defaultRegion: null,
  avatarVersion: null,
  favoriteTeams: [],
  favoriteCompetitions: [],
  // A reader, when we could not find out. The fallback direction that grants
  // nothing is the only safe one for a field about permission, even one nothing
  // authorises from.
  role: DEFAULT_ROLE,
};

/**
 * The fields the session payload carries. Preferences, avatar and role come
 * from one query, a left join from `user`. A failure is logged and answered
 * with no extras.
 *
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 * decisions/026-favourites.md
 */
export async function getSessionExtrasFor(userId: string): Promise<SessionExtras> {
  try {
    const [row] = await db
      .select({
        defaultRegion: userPreferences.defaultRegion,
        avatarVersion: userAvatar.version,
        role: user.role,
      })
      .from(user)
      .leftJoin(userPreferences, eq(userPreferences.userId, user.id))
      .leftJoin(userAvatar, eq(userAvatar.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);

    if (row === undefined) return NO_EXTRAS;

    // A second round trip, not more joins: the favourites are two one-to-many
    // relations, and joining them onto the same row would multiply it out.
    const favourites = await favouritesForSession(userId);

    return {
      defaultRegion: resolveRegion(row.defaultRegion),
      avatarVersion: row.avatarVersion,
      favoriteTeams: favourites.teams,
      favoriteCompetitions: favourites.competitions,
      // Narrowed rather than trusted: the column is `text`, so a value written
      // by hand — which is how the first admin is made — could be anything.
      role: isRole(row.role) ? row.role : DEFAULT_ROLE,
    };
  } catch (error) {
    logger.error({ err: error, userId }, "Reading the session extras failed");
    return NO_EXTRAS;
  }
}
