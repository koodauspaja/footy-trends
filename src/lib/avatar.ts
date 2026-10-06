import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userAvatar } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Reading and writing one reader's stored avatar. The bytes live in Postgres,
 * so deleting the account deletes the image.
 *
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 */

export type StoredAvatar = { bytes: Buffer; contentType: string; version: string };

/**
 * The database's size limit, and the share of it this table may take before a
 * warning is logged. The threshold stops nothing.
 *
 * decisions/025-custom-avatar.md
 */
const DATABASE_LIMIT_BYTES = 8 * 1024 * 1024 * 1024;
const WARN_ABOVE_BYTES = DATABASE_LIMIT_BYTES / 10;

/**
 * The stored avatar for one reader, or null when they have none.
 *
 * decisions/025-custom-avatar.md
 */
export async function getAvatar(userId: string): Promise<StoredAvatar | null> {
  const [row] = await db
    .select({
      bytes: userAvatar.bytes,
      contentType: userAvatar.contentType,
      version: userAvatar.version,
    })
    .from(userAvatar)
    .where(eq(userAvatar.userId, userId))
    .limit(1);

  return row ?? null;
}

/**
 * Stores one reader's avatar, replacing whatever was there. Returns the new
 * version, which is what the image URL carries.
 *
 * decisions/025-custom-avatar.md
 */
export async function saveAvatar(
  userId: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  // A fresh random token per write, not a timestamp. One URL serves every
  // reader, so a shared token would serve one reader's picture to another.
  const version = randomUUID();
  const updatedAt = new Date();

  await db
    .insert(userAvatar)
    .values({ userId, version, bytes, contentType, updatedAt })
    // One row per reader, by primary key: an upload replaces rather than
    // accumulates.
    .onConflictDoUpdate({
      target: userAvatar.userId,
      set: { version, bytes, contentType, updatedAt },
    });

  await warnIfTableIsGrowing();

  return version;
}

/**
 * Removes one reader's avatar. Removing one that does not exist is not an error.
 *
 * decisions/025-custom-avatar.md
 */
export async function deleteAvatar(userId: string): Promise<void> {
  await db.delete(userAvatar).where(eq(userAvatar.userId, userId));
}

/**
 * Warns in the log when the table has grown into a share of the database
 * worth knowing about. Its own failure is logged, never thrown.
 *
 * decisions/025-custom-avatar.md
 */
async function warnIfTableIsGrowing(): Promise<void> {
  try {
    // The table name is a literal because `pg_total_relation_size` takes a
    // `regclass`. Counts come back as text: they are bigints.
    const rows = await db.execute<{ bytes: string; count: string }>(
      sql`select pg_total_relation_size('user_avatar')::text as bytes, count(*)::text as count from user_avatar`
    );
    const row = rows.at(0);
    if (row === undefined) return;

    const bytes = Number(row.bytes);
    if (!Number.isFinite(bytes) || bytes <= WARN_ABOVE_BYTES) return;

    logger.warn(
      {
        tableBytes: bytes,
        rows: Number(row.count),
        limitBytes: DATABASE_LIMIT_BYTES,
        shareOfLimit: Number((bytes / DATABASE_LIMIT_BYTES).toFixed(3)),
      },
      "Stored avatars are taking a noticeable share of the database; the next step is a Railway volume"
    );
  } catch (error) {
    logger.error({ err: error }, "Could not measure the avatar table");
  }
}
