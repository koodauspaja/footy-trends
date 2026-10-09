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
 * Administration against a real Postgres: the cascade, the last-admin guard
 * under two concurrent demotions, and a promoted role visible to the next read.
 *
 * decisions/028-admin-tools-and-roles.md
 */

const ADMIN_ID = "itest-admin-1";
const SECOND_ADMIN_ID = "itest-admin-2";
const READER_ID = "itest-admin-reader";

async function insertUser(id: string, email: string, role: "user" | "admin") {
  await db
    .insert(user)
    .values({ id, name: "Integration Reader", email, emailVerified: true, role });
}

// Everything that must disappear with the row, one per referencing table.
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

    // Queried table by table, not trusting the constraint.
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

  it("leaves an admin standing when two admins demote each other at once", async () => {
    // Both callers read the same count, and only the lock on the admin set stops
    // both. Each actor is an admin: `changeRole` does not check the actor's
    // role, so a non-admin actor would pass without testing the guard.
    const [first, second] = await Promise.all([
      changeRole(ADMIN_ID, SECOND_ADMIN_ID, "user"),
      changeRole(SECOND_ADMIN_ID, ADMIN_ID, "user"),
    ]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const survivors = await db.select().from(user).where(eq(user.role, "admin"));
    expect(survivors.filter((row) => row.id.startsWith("itest-admin"))).toHaveLength(1);
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
    const { users } = await listUsers(1);
    const ours = users.filter((entry) => entry.id.startsWith("itest-admin"));

    expect(ours).toHaveLength(3);
    const times = ours.map((entry) => entry.createdAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("reports the page it actually served, clamped to one that exists", async () => {
    // Asking for page nine of one shows page one rather than an empty table
    // with no explanation — the failure the old hard cap had, in a new place.
    const asked = await listUsers(9);

    expect(asked.page).toBe(asked.pages);
    expect(asked.users.length).toBeGreaterThan(0);
  });

  it("counts every user, not just the page", async () => {
    const { total, users } = await listUsers(1);
    const { USERS_PER_PAGE } = await import("@/lib/admin-user-view");

    // The three this file seeded, at least. Not an exact number: other
    // integration files insert their own users, and they share a database.
    expect(total).toBeGreaterThanOrEqual(3);
    // A page never exceeds its size. Not `users.length <= total`: the count and
    // the page are two queries, so a concurrent insert can put the page one ahead.
    expect(users.length).toBeLessThanOrEqual(USERS_PER_PAGE);
  });
});
