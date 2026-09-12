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
 * **It returns null rather than throwing.** The page answers a non-admin with
 * the not-found page, and a thrown error there would be a 500 instead — which
 * both tells a stranger that something exists and reports our refusal as our
 * failure. Callers decide what refusal looks like; this only decides whether to
 * refuse. (What status that refusal carries is `src/proxy.ts`'s problem and is
 * documented there: a signed-out visitor gets a real 404, a signed-in non-admin
 * a 200, because a stream commits its status before `notFound()` is caught.)
 *
 * Both halves of the question are answered here: signed out is `null`, and
 * signed in without the role is `null`, and the two are deliberately
 * indistinguishable to the caller so no caller can leak the difference.
 */
export async function requireAdmin(): Promise<string | null> {
  /**
   * Declared outside the `try` so the log can name the caller when there is
   * one, and inside it when there is not.
   */
  let userId: string | null = null;

  try {
    // Inside the guard, not before it. `currentUserId` reads the session
    // through better-auth, which queries Postgres — so it fails for exactly
    // the reasons the lookup below does, and leaving it outside meant a
    // session-read failure threw a 500 instead of refusing. The contract is
    // that this function refuses rather than raises; a call that can throw
    // sitting above the `try` quietly broke it.
    userId = await currentUserId();
    if (userId === null) return null;

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
    // Neither a database failure nor an unreadable session is permission.
    // Refusing on error means an outage closes the admin area rather than
    // opening it.
    logger.error({ err: error, userId }, "Could not determine whether the caller is an admin");
    return null;
  }
}
