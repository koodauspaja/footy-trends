import { eq } from "drizzle-orm";
import { db } from "@/db";
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

/** Thrown inside the transaction to undo its delete when the key is taken. */
class NicknameTaken extends Error {}

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
 * `null`. The user is locked first, so their own saves run one after the
 * other; then their row is deleted and written again, and the insert can only
 * conflict on another user's key, whose transaction it waits for.
 *
 * decisions/077-nickname.md
 */
export async function saveNickname(
  userId: string,
  next: StoredNickname | null
): Promise<NicknameSave> {
  try {
    return await db.transaction(async (tx) => {
      await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("no key update");
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
 * Removes a user's nickname, whether they had one or not.
 *
 * decisions/077-nickname.md
 */
export async function clearNickname(userId: string): Promise<void> {
  await db.delete(userNickname).where(eq(userNickname.userId, userId));
}
