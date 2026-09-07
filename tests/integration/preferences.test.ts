import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { session, user, userPreferences } from "@/db/schema";
import { getPreferencesFor } from "@/lib/preferences";

/**
 * The preferences table against a real Postgres: the constraints
 * specs/024-account-settings.md relies on are enforced by the database, not
 * only by the code that writes it.
 */
const USER_ID = "itest-pref-user-1";
const OTHER_USER_ID = "itest-pref-user-2";
const USER_IDS = [USER_ID, OTHER_USER_ID];

function userRow(id: string, email: string) {
  return { id, name: "Integration Reader", email, emailVerified: true };
}

function preferenceRow(id: string, userId: string, overrides = {}) {
  return {
    id,
    userId,
    defaultRegion: "kotimaa",
    defaultCompetitionDomestic: "M1L",
    defaultCompetitionForeign: null,
    defaultCompetitionNational: null,
    ...overrides,
  };
}

afterEach(async () => {
  await db.delete(userPreferences).where(inArray(userPreferences.userId, USER_IDS));
  await db.delete(session).where(inArray(session.userId, USER_IDS));
  await db.delete(user).where(inArray(user.id, USER_IDS));
});

describe("user preferences", () => {
  it("reads back what was stored", async () => {
    await db.insert(user).values(userRow(USER_ID, "pref1@example.com"));
    await db.insert(userPreferences).values(preferenceRow("itest-pref-1", USER_ID));

    expect(await getPreferencesFor(USER_ID)).toEqual({
      defaultRegion: "kotimaa",
      defaultCompetitionDomestic: "M1L",
      defaultCompetitionForeign: null,
      defaultCompetitionNational: null,
    });
  });

  it("has nothing to read for a reader who never saved", async () => {
    await db.insert(user).values(userRow(USER_ID, "pref1@example.com"));

    // The row is created on first save, not at sign-in, so its absence is the
    // normal state rather than an error.
    expect(await getPreferencesFor(USER_ID)).toBeNull();
  });

  it("allows only one row per reader", async () => {
    await db.insert(user).values(userRow(USER_ID, "pref1@example.com"));
    await db.insert(userPreferences).values(preferenceRow("itest-pref-1", USER_ID));

    await expect(
      db.insert(userPreferences).values(preferenceRow("itest-pref-2", USER_ID))
    ).rejects.toThrow();
  });

  it("cascades away with its user, leaving nothing orphaned", async () => {
    // Account deletion promises to be complete; a surviving preferences row
    // would break that.
    await db.insert(user).values(userRow(USER_ID, "pref1@example.com"));
    await db.insert(userPreferences).values(preferenceRow("itest-pref-1", USER_ID));

    await db.delete(user).where(eq(user.id, USER_ID));

    expect(
      await db.select().from(userPreferences).where(eq(userPreferences.userId, USER_ID))
    ).toHaveLength(0);
  });

  it("survives a session being revoked, because it belongs to the user", async () => {
    await db.insert(user).values(userRow(USER_ID, "pref1@example.com"));
    await db.insert(userPreferences).values(preferenceRow("itest-pref-1", USER_ID));
    await db.insert(session).values({
      id: "itest-pref-session",
      token: "itest-pref-token",
      userId: USER_ID,
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    await db.delete(session).where(eq(session.userId, USER_ID));

    expect(await getPreferencesFor(USER_ID)).not.toBeNull();
  });

  it("refuses preferences for a user that does not exist", async () => {
    await expect(
      db.insert(userPreferences).values(preferenceRow("itest-pref-1", "itest-pref-absent"))
    ).rejects.toThrow();
  });

  it("keeps two readers' preferences apart", async () => {
    await db
      .insert(user)
      .values([userRow(USER_ID, "pref1@example.com"), userRow(OTHER_USER_ID, "pref2@example.com")]);
    await db
      .insert(userPreferences)
      .values([
        preferenceRow("itest-pref-1", USER_ID, { defaultRegion: "kotimaa" }),
        preferenceRow("itest-pref-2", OTHER_USER_ID, { defaultRegion: "ulkomaat" }),
      ]);

    expect((await getPreferencesFor(USER_ID))?.defaultRegion).toBe("kotimaa");
    expect((await getPreferencesFor(OTHER_USER_ID))?.defaultRegion).toBe("ulkomaat");
  });
});
