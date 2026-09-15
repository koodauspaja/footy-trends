import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { user, userAvatar, userPreferences } from "@/db/schema";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/admin-role";
import { favouritesForSession } from "@/lib/favourites";
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
 * What the browser needs from the session beyond better-auth's own fields.
 *
 * `avatarVersion` is the avatar's random cache token, or null when the reader
 * has no custom picture — the client builds `/api/avatar/me?v=…` from it. See
 * specs/025-custom-avatar.md.
 */
export type SessionExtras = {
  defaultRegion: RegionSegment | null;
  avatarVersion: string | null;
  /**
   * The reader's favourites as keys, from specs/026-favourites.md.
   *
   * They ride here because the toggle renders on the region picker, which lives
   * on the four pages `rendering-mode.test.ts` keeps prerendered (#182) —
   * reading a session on the server there would cost them that. The browser
   * already fetches this payload, so a client toggle costs no extra request.
   */
  favoriteTeams: string[];
  favoriteCompetitions: string[];
  /**
   * The reader's role, so the account menu can decide whether to offer the
   * `Ylläpito` link — from specs/028-admin-tools-and-roles.md.
   *
   * **It costs nothing to carry.** The query below already selects from `user`;
   * this is one more column on a row that was being read anyway, so unlike the
   * favourites it adds no round trip and no measurable payload.
   *
   * **It is not an authorisation.** Nothing decides access from this. The link
   * it hides is a convenience, and `requireAdmin()` — which reads the column
   * from the database on every request — is what actually refuses. A session is
   * issued once, so this value can be stale by exactly as long as the session
   * lives; that is tolerable for whether a menu item renders and intolerable
   * for whether a page opens, which is why only one of them uses it.
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
 * The fields the session payload carries, for the browser that already fetches
 * it.
 *
 * Separate from `getPreferencesFor` because it runs inside better-auth's
 * `customSession` on every `/api/auth/get-session` call: reading two columns and
 * swallowing failure keeps a database blip from turning a session lookup — and
 * therefore the whole header — into an error. A reader who cannot be redirected
 * simply sees the region picker, which is the app's stock behaviour, and one
 * whose avatar version is missing gets the Google picture, which is the
 * fallback that already exists.
 *
 * **One query for both**, by a left join from `user`: the preference row and
 * the avatar row are independently optional, and either may be absent for a
 * reader who has one and not the other. Joining from `user` is what keeps a
 * missing preference row from hiding a present avatar. Adding a field here must
 * not add a round trip to every page load.
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

    // A second round trip rather than more joins. The favourites are two
    // one-to-many relations, and joining them onto the same row would multiply
    // it out — a reader with 20 teams and 5 competitions would fetch 100 rows to
    // learn one region. Two small indexed queries beat that.
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
