import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/admin-role";
import { type AdminUser, type AdminWriteResult, pageCount, windowFor } from "@/lib/admin-user-view";
import { logger } from "@/lib/logger";

/**
 * Reading and changing who uses the app. Nothing here checks authorisation:
 * every caller passes `requireAdmin()` first and hands in the acting admin's id.
 *
 * decisions/028-admin-tools-and-roles.md
 * decisions/531-comments-say-what-code-is-for.md
 */

export type { AdminUser, AdminWriteResult } from "@/lib/admin-user-view";

/** One page of users, and how many pages there are. */
export type UserPage = { users: AdminUser[]; page: number; pages: number; total: number };

/**
 * One page of users, newest first. Counted before it is read, so a page past
 * the last shows the last rather than an empty table.
 *
 * decisions/531-comments-say-what-code-is-for.md
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
    // `created_at` is not unique; without the id, two accounts made in the same
    // millisecond could swap pages, one shown twice and the other never.
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(limit)
    .offset(offset);

  // The column is `text` and the first admin is made by hand in SQL, so an
  // unknown role is possible; it reads as the default, which grants nothing.
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

/** The transaction handle drizzle hands `db.transaction`. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `run` with every admin row locked, so two admins demoting each other at
 * once cannot leave none: the second waits, re-counts and refuses.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
async function withAdminsLocked<T>(
  run: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${user} where ${user.role} = 'admin' for update`);
    return run(tx);
  });
}

/**
 * What both writes share: refuse self, lock the admin set, find the target,
 * and refuse to remove the last admin.
 *
 * decisions/531-comments-say-what-code-is-for.md
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
 * Promote or demote. Self is refused either way: demoting yourself locks you
 * out, and promoting yourself means nothing.
 *
 * decisions/531-comments-say-what-code-is-for.md
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
 * Removes an account and everything it owns, its sessions included: every
 * table referencing `user` cascades, so one `DELETE` is the whole of it.
 *
 * decisions/531-comments-say-what-code-is-for.md
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
