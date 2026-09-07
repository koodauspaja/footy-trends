import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { account, session, user } from "@/db/schema";

/**
 * The auth tables against a real Postgres: the constraints
 * specs/023-google-oauth-login.md relies on are enforced by the database, not
 * only by better-auth continuing to behave.
 *
 * Ids are strings here because better-auth generates its own — see the comment
 * on these tables in src/db/schema.ts.
 */
const USER_ID = "itest-user-993101";
const OTHER_USER_ID = "itest-user-993102";
const USER_IDS = [USER_ID, OTHER_USER_ID];
const GOOGLE_SUB = "itest-google-993101";

function userRow(id: string, email: string) {
  return { id, name: "Integration Reader", email, emailVerified: true };
}

function sessionRow(id: string, token: string, userId: string) {
  return {
    id,
    token,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

function accountRow(id: string, accountId: string, userId: string) {
  return { id, accountId, providerId: "google", userId };
}

afterEach(async () => {
  // Cascades remove sessions and accounts, but delete them first so a failed
  // assertion mid-test cannot leave rows behind under a user that never landed.
  await db.delete(session).where(inArray(session.userId, USER_IDS));
  await db.delete(account).where(inArray(account.userId, USER_IDS));
  await db.delete(user).where(inArray(user.id, USER_IDS));
});

describe("auth tables", () => {
  it("reads a user back from a session token, which is what every request does", async () => {
    await db.insert(user).values(userRow(USER_ID, "reader@example.com"));
    await db.insert(session).values(sessionRow("itest-session-1", "itest-token-1", USER_ID));

    const [row] = await db
      .select({ name: user.name, email: user.email })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .where(eq(session.token, "itest-token-1"));

    expect(row).toEqual({ name: "Integration Reader", email: "reader@example.com" });
  });

  it("cascades sessions and accounts away when the user is deleted", async () => {
    await db.insert(user).values(userRow(USER_ID, "reader@example.com"));
    await db.insert(session).values(sessionRow("itest-session-1", "itest-token-1", USER_ID));
    await db.insert(account).values(accountRow("itest-account-1", GOOGLE_SUB, USER_ID));

    await db.delete(user).where(eq(user.id, USER_ID));

    expect(await db.select().from(session).where(eq(session.userId, USER_ID))).toHaveLength(0);
    expect(await db.select().from(account).where(eq(account.userId, USER_ID))).toHaveLength(0);
  });

  it("lets one user hold several sessions, so signing in twice does not sign out the first device", async () => {
    await db.insert(user).values(userRow(USER_ID, "reader@example.com"));
    await db
      .insert(session)
      .values([
        sessionRow("itest-session-1", "itest-token-1", USER_ID),
        sessionRow("itest-session-2", "itest-token-2", USER_ID),
      ]);

    expect(await db.select().from(session).where(eq(session.userId, USER_ID))).toHaveLength(2);
  });

  it("refuses a second session on the same token", async () => {
    await db.insert(user).values(userRow(USER_ID, "reader@example.com"));
    await db.insert(session).values(sessionRow("itest-session-1", "itest-token-1", USER_ID));

    await expect(
      db.insert(session).values(sessionRow("itest-session-2", "itest-token-1", USER_ID))
    ).rejects.toThrow();
  });

  it("refuses to attach one Google account to two users", async () => {
    // The invariant behind "signing in again adds no second user row".
    await db
      .insert(user)
      .values([
        userRow(USER_ID, "reader@example.com"),
        userRow(OTHER_USER_ID, "other@example.com"),
      ]);
    await db.insert(account).values(accountRow("itest-account-1", GOOGLE_SUB, USER_ID));

    await expect(
      db.insert(account).values(accountRow("itest-account-2", GOOGLE_SUB, OTHER_USER_ID))
    ).rejects.toThrow();
  });

  it("refuses two users sharing an email address", async () => {
    await db.insert(user).values(userRow(USER_ID, "reader@example.com"));

    await expect(
      db.insert(user).values(userRow(OTHER_USER_ID, "reader@example.com"))
    ).rejects.toThrow();
  });

  it("refuses a session for a user that does not exist", async () => {
    await expect(
      db.insert(session).values(sessionRow("itest-session-1", "itest-token-1", "itest-user-absent"))
    ).rejects.toThrow();
  });
});
