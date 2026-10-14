import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { isAdmin } from "@/lib/admin-role";
import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";

/**
 * The one authorisation check: everything admin-only goes through this and
 * nothing else.
 *
 * decisions/028-admin-tools-and-roles.md
 */

/**
 * The signed-in admin's user id, or `null` for everyone else. Reads the role
 * from the database, never from the session, and returns null where it could
 * throw. Signed out and not an admin are the same answer to the caller.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export async function requireAdmin(): Promise<string | null> {
  // Declared outside the `try` so the log can name the caller when there is one.
  let userId: string | null = null;

  try {
    // Inside the guard, not before it: `currentUserId` queries Postgres and can
    // fail as the lookup below does, and this function refuses, never raises.
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
