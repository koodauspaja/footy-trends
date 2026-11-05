import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userNickname } from "@/db/schema";

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
 * `null`. The user's row is deleted and written again in one transaction, so
 * the insert can only conflict on the key: another user's, whose transaction
 * it waits for when two save the same name at once.
 *
 * decisions/077-nickname.md
 */
export async function saveNickname(
  userId: string,
  next: StoredNickname | null
): Promise<NicknameSave> {
  try {
    return await db.transaction(async (tx) => {
      const removed = await tx
        .delete(userNickname)
        .where(eq(userNickname.userId, userId))
        .returning({ userId: userNickname.userId });
      if (next === null) return "removed";
      const inserted = await tx
        .insert(userNickname)
        .values({ userId, nickname: next.nickname, nicknameKey: next.key, updatedAt: new Date() })
        .onConflictDoNothing()
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
