import { eq } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import { user, userNickname } from "@/db/schema";

/**
 * Reading and writing a user's nickname. The rules it is checked by are in
 * `nickname.ts`; this only stores what passed them.
 *
 * decisions/077-nickname.md
 */

export type StoredNickname = { nickname: string; key: string };

/**
 * What a save did, or `taken` when another user has the same key.
 *
 * decisions/077-nickname.md
 */
export type NicknameSave = "set" | "changed" | "removed" | "taken";

/**
 * Thrown inside the transaction to undo its delete when the key is taken.
 *
 * decisions/077-nickname.md
 */
class NicknameTaken extends Error {}

/**
 * Locks the user's row for the transaction. `no key update` leaves the
 * foreign-key checks of the user's other rows unblocked.
 *
 * decisions/077-nickname.md
 */
async function lockUser(tx: Transaction, userId: string): Promise<void> {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("no key update");
}

/**
 * A user's nickname, or `null` when they have none.
 *
 * decisions/077-nickname.md
 */
export async function getNickname(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ nickname: userNickname.nickname })
    .from(userNickname)
    .where(eq(userNickname.userId, userId))
    .limit(1);
  return row?.nickname ?? null;
}

/**
 * Stores a user's nickname in place of the one they had, or removes it for
 * `null`, with the user locked so their own writes run one after the other.
 *
 * decisions/077-nickname.md
 */
export async function saveNickname(
  userId: string,
  next: StoredNickname | null
): Promise<NicknameSave> {
  try {
    return await db.transaction(async (tx) => {
      await lockUser(tx, userId);
      // With the user's own row gone, the insert can conflict only on another user's key.
      const removed = await tx
        .delete(userNickname)
        .where(eq(userNickname.userId, userId))
        .returning({ userId: userNickname.userId });
      if (next === null) return "removed";
      const inserted = await tx
        .insert(userNickname)
        .values({ userId, nickname: next.nickname, nicknameKey: next.key, updatedAt: new Date() })
        .onConflictDoNothing({ target: userNickname.nicknameKey })
        .returning({ userId: userNickname.userId });
      if (inserted.length === 0) throw new NicknameTaken();
      return removed.length > 0 ? "changed" : "set";
    });
  } catch (error) {
    if (error instanceof NicknameTaken) return "taken";
    throw error;
  }
}

/**
 * Removes a user's nickname, whether they had one or not, under the same lock
 * as a save, so it cannot miss a save in flight.
 *
 * decisions/077-nickname.md
 */
export async function clearNickname(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await tx.delete(userNickname).where(eq(userNickname.userId, userId));
  });
}
