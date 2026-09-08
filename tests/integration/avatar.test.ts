import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user, userAvatar } from "@/db/schema";
import { deleteAvatar, getAvatar, saveAvatar } from "@/lib/avatar";
import { getSessionExtrasFor } from "@/lib/preferences";

/**
 * The avatar round trip against a real Postgres, from
 * specs/025-custom-avatar.md.
 *
 * Two things here cannot be tested anywhere else. `bytea` has to survive the
 * driver unchanged — an image that comes back re-encoded as text is a corrupt
 * image — and the cascade has to be real, because specs/024 promises account
 * deletion is complete and an orphaned picture would make that false.
 */

const USER_ID = "itest-avatar-user";
const OTHER_ID = "itest-avatar-other";

/** Bytes that are not valid UTF-8, so a text round trip could not survive them. */
const BYTES = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x80, 0xfe, 0x01, 0x7f]);

async function insertUser(id: string, email: string) {
  await db.insert(user).values({ id, name: "Integration Reader", email, emailVerified: true });
}

beforeEach(async () => {
  await insertUser(USER_ID, "itest-avatar@example.com");
  await insertUser(OTHER_ID, "itest-avatar-other@example.com");
});

afterEach(async () => {
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.delete(user).where(eq(user.id, OTHER_ID));
});

describe("avatar storage", () => {
  it("returns the bytes exactly as stored", async () => {
    await saveAvatar(USER_ID, BYTES, "image/webp");

    const stored = await getAvatar(USER_ID);

    expect(stored?.bytes).toEqual(BYTES);
    expect(stored?.contentType).toBe("image/webp");
    expect(stored?.version).toEqual(expect.any(Number));
  });

  it("returns null for a reader who has none", async () => {
    expect(await getAvatar(USER_ID)).toBeNull();
  });

  it("replaces rather than accumulates", async () => {
    const first = await saveAvatar(USER_ID, BYTES, "image/webp");
    const replacement = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const second = await saveAvatar(USER_ID, replacement, "image/webp");

    const rows = await db.select().from(userAvatar).where(eq(userAvatar.userId, USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bytes).toEqual(replacement);
    expect(second).toBeGreaterThan(first);
  });

  it("gives every replacement a version after the last", async () => {
    /**
     * The version is the cache key in a year-long `immutable` URL, so a repeat
     * of an earlier version would leave the reader looking at the old picture
     * indefinitely.
     *
     * Measured honestly: this case passes under a plain `now()` too, because
     * five sequential round trips do not land inside one millisecond. It is
     * here for the ordering, and the test below is the one that fails without
     * `greatest(now(), updated_at + 1ms)`.
     */
    const versions: number[] = [];
    for (let i = 0; i < 5; i++) {
      versions.push(await saveAvatar(USER_ID, Buffer.from([i]), "image/webp"));
    }

    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
    // And the last write is what is stored, not merely the last version.
    expect((await getAvatar(USER_ID))?.version).toBe(versions.at(-1));
  });

  it("keeps every concurrent upload on a version of its own", async () => {
    /**
     * **The test that earns the SQL.** Three uploads in flight together share a
     * `now()` — verified by mutation: replacing `greatest(now(), updated_at +
     * interval '1 millisecond')` with plain `now()` fails exactly this case and
     * nothing else in the file.
     *
     * It is also the case application-side read-then-write could not survive.
     * Postgres serialises the upsert on the primary key, so each statement sees
     * the previous one's row.
     */
    const results = await Promise.all([
      saveAvatar(USER_ID, Buffer.from([1]), "image/webp"),
      saveAvatar(USER_ID, Buffer.from([2]), "image/webp"),
      saveAvatar(USER_ID, Buffer.from([3]), "image/webp"),
    ]);

    expect(new Set(results).size).toBe(3);
  });

  it("removes one reader's picture and leaves everyone else's alone", async () => {
    await saveAvatar(USER_ID, BYTES, "image/webp");
    await saveAvatar(OTHER_ID, BYTES, "image/webp");

    await deleteAvatar(USER_ID);

    expect(await getAvatar(USER_ID)).toBeNull();
    expect(await getAvatar(OTHER_ID)).not.toBeNull();
  });

  it("treats removing a picture that does not exist as done", async () => {
    await expect(deleteAvatar(USER_ID)).resolves.toBeUndefined();
  });

  it("goes with the account when it is deleted", async () => {
    /**
     * The whole reason the bytes live in Postgres rather than a bucket:
     * deletion is a foreign-key cascade, so "delete the account" cannot leave
     * the picture behind. specs/024 promises that deletion is irreversible and
     * complete, and this is what makes it true rather than intended.
     */
    await saveAvatar(USER_ID, BYTES, "image/webp");

    await db.delete(user).where(eq(user.id, USER_ID));

    const rows = await db.select().from(userAvatar).where(eq(userAvatar.userId, USER_ID));
    expect(rows).toEqual([]);
  });

  it("puts the version on the session payload without a preferences row", async () => {
    // The two rows are independently optional. A reader who has never saved a
    // setting can still have a picture, and the join has to answer for that.
    const version = await saveAvatar(USER_ID, BYTES, "image/webp");

    expect(await getSessionExtrasFor(USER_ID)).toEqual({
      defaultRegion: null,
      avatarVersion: version,
    });
  });
});
