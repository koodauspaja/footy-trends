import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userAvatar } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Reading and writing one reader's stored avatar, from
 * specs/025-custom-avatar.md.
 *
 * Bytes live in Postgres rather than in object storage or on a volume: no new
 * vendor, no new secret, and deletion is a foreign-key cascade, so an account
 * cannot leave an orphaned image behind. That is what keeps
 * specs/024-account-settings.md's "irreversible and complete" promise true by
 * construction rather than by a reconciliation job.
 */

export type StoredAvatar = { bytes: Buffer; contentType: string; version: number };

/**
 * The database's size limit, and the share of it this table may take before
 * anyone is told.
 *
 * The arithmetic, measured while scoping: an avatar is at most ~21 kB, because
 * random noise is incompressible and no photograph encodes worse at the same
 * dimensions. With row overhead, call it 24 kB. So 800 MB is roughly 33 000
 * readers with custom pictures — against a whole database that is 21 MB today.
 *
 * The threshold is not there to stop anything. It is there so that the ratio
 * changing is noticed by somebody rather than by nobody, with the remaining
 * 90 % of the limit left to react in. The next step when it fires is a Railway
 * volume; the spec lists what has to be true for that to work.
 */
const DATABASE_LIMIT_BYTES = 8 * 1024 * 1024 * 1024;
const WARN_ABOVE_BYTES = DATABASE_LIMIT_BYTES / 10;

/** The stored avatar for one reader, or null when they have none. */
export async function getAvatar(userId: string): Promise<StoredAvatar | null> {
  const [row] = await db
    .select({
      bytes: userAvatar.bytes,
      contentType: userAvatar.contentType,
      updatedAt: userAvatar.updatedAt,
    })
    .from(userAvatar)
    .where(eq(userAvatar.userId, userId))
    .limit(1);

  if (row === undefined) return null;
  return {
    bytes: row.bytes,
    contentType: row.contentType,
    version: row.updatedAt.getTime(),
  };
}

/**
 * Stores one reader's avatar, replacing whatever was there.
 *
 * Returns the new version — `updatedAt` in epoch milliseconds — which is what
 * the image URL carries so that an `immutable` response can be safe.
 */
export async function saveAvatar(
  userId: string,
  bytes: Buffer,
  contentType: string
): Promise<number> {
  const updatedAt = new Date();

  await db
    .insert(userAvatar)
    .values({ userId, bytes, contentType, updatedAt })
    // One row per reader, by primary key: an upload replaces rather than
    // accumulates.
    .onConflictDoUpdate({
      target: userAvatar.userId,
      set: { bytes, contentType, updatedAt },
    });

  await warnIfTableIsGrowing();

  return updatedAt.getTime();
}

/** Removes one reader's avatar. Removing one that does not exist is not an error. */
export async function deleteAvatar(userId: string): Promise<void> {
  await db.delete(userAvatar).where(eq(userAvatar.userId, userId));
}

/**
 * Says so, once, when the table has grown into a share of the database worth
 * knowing about.
 *
 * Runs after a successful upload — a rare write, once per reader — so the cost
 * is one extra query on a path nobody is waiting on twice.
 *
 * **Its own failure is swallowed deliberately.** A diagnostic that can break
 * the thing it watches is worse than no diagnostic: the avatar is already
 * stored by the time this runs, and losing the warning costs a log line where
 * throwing would cost the reader their upload.
 */
async function warnIfTableIsGrowing(): Promise<void> {
  try {
    // The table name appears literally rather than as `${userAvatar}`:
    // `pg_total_relation_size` takes a `regclass`, so it needs the name as a
    // string either way, and having it in one form twice is clearer than in
    // two forms once each. Counts come back as text because a bigint does not
    // fit a JavaScript number by right — these values do, but the driver is not
    // going to guess that.
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
