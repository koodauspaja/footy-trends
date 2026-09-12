import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/admin-role";
import { type AdminUser, type AdminWriteResult, pageCount, windowFor } from "@/lib/admin-user-view";
import { logger } from "@/lib/logger";

/**
 * Reading and changing who uses the app, from specs/028-admin-tools-and-roles.md.
 *
 * Separate from `admin-actions.ts` so the rules can be tested without a
 * `"use server"` boundary in the way — the same split `favourites.ts` and
 * `favourite-actions.ts` already use. **Nothing here checks authorisation**:
 * every caller must have passed `requireAdmin()` first, and the acting admin's
 * id is a parameter rather than something this reads, so it cannot be spoofed
 * by a caller that skipped the gate.
 */

export type { AdminUser, AdminWriteResult } from "@/lib/admin-user-view";

/** One page of users, and how many pages there are. */
export type UserPage = { users: AdminUser[]; page: number; pages: number; total: number };

/**
 * One page of users, newest first — because the question the list answers is
 * usually "who is new".
 *
 * **Counted before it is read**, so the window can be clamped: asking for page
 * nine of four shows page four rather than an empty table with no explanation.
 * Two queries rather than one, which is the cost of not guessing how many pages
 * exist. This replaced a hard cap of 500, which bounded the render at the price
 * of making the oldest accounts unreachable.
 */
export async function listUsers(requestedPage: number): Promise<UserPage> {
  const [counted] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
  const total = counted?.n ?? 0;
  const pages = pageCount(total);
  const page = Math.min(Math.max(1, requestedPage), pages);
  const { limit, offset } = windowFor(page, total);

  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    // A second sort key, because `created_at` is not unique: two accounts made
    // in the same millisecond could otherwise swap between pages and one of
    // them be shown twice while the other never appears.
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(limit)
    .offset(offset);

  // Narrowed rather than trusted: the column is `text`, and the first admin is
  // made by hand in SQL, so an unrecognised value is possible. It renders as a
  // reader, which is the direction that grants nothing.
  return {
    users: rows.map((row) => ({
      ...row,
      role: isRole(row.role) ? row.role : DEFAULT_ROLE,
    })),
    page,
    pages,
    total,
  };
}

/**
 * Locks every current admin row for the duration of the write.
 *
 * The race this closes is two admins acting on each other at once: both would
 * count two admins, both would proceed, and the app would be left with none.
 * Locking the admin *set* rather than the target row makes the second
 * transaction wait and then re-count, so it sees one admin and refuses.
 *
 * A row becoming an admin concurrently is not blocked, and does not need to be:
 * it can only make the count larger, which is the direction that refuses less
 * often rather than more dangerously.
 */
/** The transaction handle drizzle hands `db.transaction`, named as `favourites.ts` names it. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function withAdminsLocked<T>(
  run: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${user} where ${user.role} = 'admin' for update`);
    return run(tx);
  });
}

/**
 * The part both writes share: refuse self, lock the admin set, find the target,
 * and refuse if this would remove the last admin.
 *
 * Extracted because the two callers had it character for character — Sonar put
 * `admin-users.ts` at 18.1% duplicated lines — and because a guard written
 * twice is a guard that eventually differs. The caller supplies only what is
 * different: whether the change would remove an admin, and what to do once it
 * is allowed.
 */
async function guardedWrite(
  actingAdminId: string,
  targetUserId: string,
  /** Whether this change takes the admin role away from the target. */
  removesAdmin: (targetRole: string) => boolean,
  apply: (tx: Transaction) => Promise<void>
): Promise<AdminWriteResult> {
  // Before the transaction: nothing to lock for a write that cannot happen.
  if (actingAdminId === targetUserId) return { ok: false, reason: "self" };

  return withAdminsLocked(async (tx) => {
    const [target] = await tx
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);
    if (target === undefined) return { ok: false, reason: "not_found" };

    if (removesAdmin(target.role)) {
      // Counted inside the lock, so the answer cannot change under us.
      const [counted] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, "admin"));
      if ((counted?.n ?? 0) <= 1) return { ok: false, reason: "last_admin" };
    }

    await apply(tx);
    return { ok: true };
  });
}

/**
 * Promote or demote, refusing the two changes that would be mistakes.
 *
 * **Self is refused** for either direction. Demoting yourself is the one-click
 * lockout, and promoting yourself is meaningless since you are already an
 * admin — refusing both is one rule rather than two, and an admin who wants to
 * leave can be removed by another admin.
 */
export async function changeRole(
  actingAdminId: string,
  targetUserId: string,
  role: Role
): Promise<AdminWriteResult> {
  try {
    return await guardedWrite(
      actingAdminId,
      targetUserId,
      (targetRole) => role === DEFAULT_ROLE && targetRole === "admin",
      async (tx) => {
        await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, targetUserId));
      }
    );
  } catch (error) {
    logger.error(
      { err: error, actingAdminId, targetUserId, role },
      "Changing a user's role failed"
    );
    return { ok: false, reason: "failed" };
  }
}

/**
 * Removes an account and everything it owns.
 *
 * One `DELETE`, because every table referencing `user` declares `on delete
 * cascade` — session, account, preferences, avatar, favourite teams and
 * favourite competitions — and avatar bytes live in Postgres rather than on a
 * volume. A second code path would be a second thing to forget, which is what
 * `user_avatar`'s own comment says the cascade is for.
 *
 * Their sessions go with the row, so deletion signs them out as a consequence
 * rather than by a separate revocation. That is relied on deliberately.
 */
export async function deleteUser(
  actingAdminId: string,
  targetUserId: string
): Promise<AdminWriteResult> {
  try {
    return await guardedWrite(
      actingAdminId,
      targetUserId,
      (targetRole) => targetRole === "admin",
      async (tx) => {
        await tx.delete(user).where(eq(user.id, targetUserId));
      }
    );
  } catch (error) {
    logger.error({ err: error, actingAdminId, targetUserId }, "Deleting a user failed");
    return { ok: false, reason: "failed" };
  }
}
