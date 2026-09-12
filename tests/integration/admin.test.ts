import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  account,
  favoriteCompetition,
  favoriteTeam,
  session,
  user,
  userAvatar,
  userPreferences,
} from "@/db/schema";
import { changeRole, deleteUser, listUsers } from "@/lib/admin-users";

/**
 * Administration against a real Postgres, from specs/028-admin-tools-and-roles.md.
 *
 * Three things cannot be tested anywhere else. The **cascade** really removes
 * everything a reader owns — the acceptance criterion says to verify it by
 * querying each table rather than by trusting the constraint. The **last-admin
 * guard** really holds when two demotions run at once, which a mocked
 * transaction cannot demonstrate. And a promoted user's role really is visible
 * to the next read, with no session involved.
 */

const ADMIN_ID = "itest-admin-1";
const SECOND_ADMIN_ID = "itest-admin-2";
const READER_ID = "itest-admin-reader";

async function insertUser(id: string, email: string, role: "user" | "admin") {
  await db
    .insert(user)
    .values({ id, name: "Integration Reader", email, emailVerified: true, role });
}

/** Everything that must disappear with the row, one per referencing table. */
async function giveTheReaderThings(): Promise<void> {
  await db.insert(session).values({
    id: `${READER_ID}-session`,
    token: `${READER_ID}-token`,
    expiresAt: new Date(Date.now() + 86_400_000),
    userId: READER_ID,
  });
  await db.insert(account).values({
    id: `${READER_ID}-account`,
    accountId: "google-123",
    providerId: "google",
    userId: READER_ID,
  });
  await db
    .insert(userPreferences)
    .values({ id: `${READER_ID}-prefs`, userId: READER_ID, defaultRegion: "kotimaa" });
  await db.insert(userAvatar).values({
    userId: READER_ID,
    version: "v1",
    bytes: Buffer.from([1, 2, 3]),
    contentType: "image/webp",
  });
  await db
    .insert(favoriteTeam)
    .values({ userId: READER_ID, source: "taso", teamProviderId: 60731 });
  await db
    .insert(favoriteCompetition)
    .values({ userId: READER_ID, region: "kotimaa", competitionCode: "VL" });
}

beforeEach(async () => {
  await insertUser(ADMIN_ID, "itest-admin-1@example.fi", "admin");
  await insertUser(SECOND_ADMIN_ID, "itest-admin-2@example.fi", "admin");
  await insertUser(READER_ID, "itest-admin-reader@example.fi", "user");
});

afterEach(async () => {
  for (const id of [ADMIN_ID, SECOND_ADMIN_ID, READER_ID]) {
    await db.delete(user).where(eq(user.id, id));
  }
});

describe("deleting a user", () => {
  it("removes every row that references them", async () => {
    await giveTheReaderThings();

    await expect(deleteUser(ADMIN_ID, READER_ID)).resolves.toEqual({ ok: true });

    // Queried table by table rather than trusting the constraint, which is what
    // the acceptance criterion asks for. `user_avatar`'s own comment says the
    // cascade is what makes deletion complete "without a second code path to
    // forget" — this is the test that would notice if one were needed.
    const counts = await Promise.all([
      db.select().from(session).where(eq(session.userId, READER_ID)),
      db.select().from(account).where(eq(account.userId, READER_ID)),
      db.select().from(userPreferences).where(eq(userPreferences.userId, READER_ID)),
      db.select().from(userAvatar).where(eq(userAvatar.userId, READER_ID)),
      db.select().from(favoriteTeam).where(eq(favoriteTeam.userId, READER_ID)),
      db.select().from(favoriteCompetition).where(eq(favoriteCompetition.userId, READER_ID)),
      db.select().from(user).where(eq(user.id, READER_ID)),
    ]);

    expect(counts.map((rows) => rows.length)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("signs them out as a consequence, because the session row goes with them", async () => {
    await giveTheReaderThings();

    await deleteUser(ADMIN_ID, READER_ID);

    // Relied on deliberately rather than issued as a separate revocation. If
    // the constraint ever changes, this fails and says why it mattered.
    const sessions = await db.select().from(session).where(eq(session.userId, READER_ID));
    expect(sessions).toEqual([]);
  });
});

describe("the last-admin guard", () => {
  it("refuses the demotion that would leave nobody", async () => {
    await changeRole(ADMIN_ID, SECOND_ADMIN_ID, "user");

    await expect(changeRole(SECOND_ADMIN_ID, ADMIN_ID, "user")).resolves.toEqual({
      ok: false,
      reason: "last_admin",
    });
  });

  it("leaves an admin standing when two demotions race", async () => {
    // The case a mocked transaction cannot show: both callers read the same
    // count, and only the row lock stops both from proceeding.
    const [first, second] = await Promise.all([
      changeRole(READER_ID, SECOND_ADMIN_ID, "user"),
      changeRole(READER_ID, ADMIN_ID, "user"),
    ]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const admins = await db.select().from(user).where(eq(user.role, "admin"));
    expect(admins.filter((row) => row.id !== READER_ID)).toHaveLength(1);
  });
});

describe("promoting", () => {
  it("is visible to the next read, with no session involved", async () => {
    await expect(changeRole(ADMIN_ID, READER_ID, "admin")).resolves.toEqual({ ok: true });

    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, READER_ID));
    expect(row?.role).toBe("admin");
  });
});

describe("listUsers", () => {
  it("returns the seeded accounts newest first", async () => {
    const users = await listUsers();
    const ours = users.filter((entry) => entry.id.startsWith("itest-admin"));

    expect(ours).toHaveLength(3);
    const times = ours.map((entry) => entry.createdAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});
