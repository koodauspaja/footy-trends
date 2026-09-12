import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { isAdmin } from "@/lib/admin-role";
import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";

/**
 * The one authorisation check, from specs/028-admin-tools-and-roles.md.
 *
 * Everything admin-only goes through this and nothing else: the page, every
 * server action, and whatever #150 builds on top. One function so that it
 * cannot be half-applied — the same reasoning behind `currentUserId`, which was
 * written three times identically before it was shared.
 */

/**
 * The signed-in admin's user id, or `null` for everyone else.
 *
 * **It reads the role from the database, never from the session.** A session is
 * client-held and issued once; a role copied into it would keep answering
 * `admin` until that session expired, so a demotion would not take effect until
 * the demoted admin happened to sign out. Reading the row costs one indexed
 * lookup by primary key and makes the answer current by construction.
 *
 * **It returns null rather than throwing.** The page has to answer 404 for a
 * non-admin, and a thrown error there is a 500 — which both tells a stranger
 * that something exists and reports our refusal as our failure. Callers decide
 * what refusal looks like; this only decides whether to refuse.
 *
 * Both halves of the question are answered here: signed out is `null`, and
 * signed in without the role is `null`, and the two are deliberately
 * indistinguishable to the caller so no caller can leak the difference.
 */
export async function requireAdmin(): Promise<string | null> {
  const userId = await currentUserId();
  if (userId === null) return null;

  try {
    const [row] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    // A signed-in id with no row is a session outliving its user — deletion
    // cascades the session away, so this is a race rather than a state, and
    // refusing is the only safe reading of it.
    return isAdmin(row?.role) ? userId : null;
  } catch (error) {
    // A database failure is not permission. Refusing on error means an outage
    // closes the admin area rather than opening it.
    logger.error({ err: error, userId }, "Could not read a user's role");
    return null;
  }
}
