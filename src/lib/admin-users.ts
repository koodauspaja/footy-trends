import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/admin-role";
import type { AdminUser, AdminWriteResult } from "@/lib/admin-user-view";
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

/**
 * The most users one page will render.
 *
 * The table is expected to hold tens of rows for the foreseeable future, so the
 * page shows all of them and has no pagination. This cap exists so that if that
 * assumption is ever badly wrong the page degrades to "the newest 500" rather
 * than to an unbounded render. Reaching it is a signal to add pagination, not
 * something to explain to the reader — no Finnish string announces it.
 */
export const MAX_USERS_LISTED = 500;

export type { AdminUser, AdminWriteResult } from "@/lib/admin-user-view";

/** Newest first, because the question the list answers is usually "who is new". */
export async function listUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(MAX_USERS_LISTED);

  // Narrowed rather than trusted: the column is `text`, and the first admin is
  // made by hand in SQL, so an unrecognised value is possible. It renders as a
  // reader, which is the direction that grants nothing.
  return rows.map((row) => ({
    ...row,
    role: isRole(row.role) ? row.role : DEFAULT_ROLE,
  }));
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
async function withAdminsLocked<T>(
  run: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${user} where ${user.role} = 'admin' for update`);
    return run(tx);
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
  if (actingAdminId === targetUserId) return { ok: false, reason: "self" };

  try {
    return await withAdminsLocked(async (tx) => {
      const [target] = await tx
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, targetUserId))
        .limit(1);
      if (target === undefined) return { ok: false, reason: "not_found" };

      // Counted inside the lock, so the answer cannot change under us.
      const [counted] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, "admin"));
      const admins = counted?.n ?? 0;

      if (role === DEFAULT_ROLE && target.role === "admin" && admins <= 1) {
        return { ok: false, reason: "last_admin" };
      }

      await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, targetUserId));
      return { ok: true };
    });
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
  if (actingAdminId === targetUserId) return { ok: false, reason: "self" };

  try {
    return await withAdminsLocked(async (tx) => {
      const [target] = await tx
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, targetUserId))
        .limit(1);
      if (target === undefined) return { ok: false, reason: "not_found" };

      const [counted] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, "admin"));
      if (target.role === "admin" && (counted?.n ?? 0) <= 1) {
        return { ok: false, reason: "last_admin" };
      }

      await tx.delete(user).where(eq(user.id, targetUserId));
      return { ok: true };
    });
  } catch (error) {
    logger.error({ err: error, actingAdminId, targetUserId }, "Deleting a user failed");
    return { ok: false, reason: "failed" };
  }
}
