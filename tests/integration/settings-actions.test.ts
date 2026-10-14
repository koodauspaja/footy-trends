import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user, userPreferences } from "@/db/schema";
import { preferredCompetitionFor } from "@/lib/competition-preferences";
import { getPreferencesFor, getSessionExtrasFor } from "@/lib/preferences";
import { saveSettings } from "@/lib/settings-actions";

/**
 * The settings' write path and read path together, against a real Postgres:
 * what `saveSettings` writes is what the pages later read. Only the session is
 * mocked.
 *
 * decisions/024-account-settings.md
 */

const USER_ID = "itest-actions-user";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: USER_ID } }) } },
}));

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

beforeEach(async () => {
  await db.insert(user).values({
    id: USER_ID,
    name: "Integration Reader",
    email: "itest-actions@example.com",
    emailVerified: true,
  });
});

afterEach(async () => {
  await db.delete(userPreferences).where(inArray(userPreferences.userId, [USER_ID]));
  await db.delete(user).where(eq(user.id, USER_ID));
});

describe("saving and reading back", () => {
  it("stores a start region the front page can act on", async () => {
    expect(await saveSettings(form({ defaultRegion: "kotimaa" }))).toEqual({ ok: true });

    // This is the value better-auth puts on the session the browser reads.
    expect((await getSessionExtrasFor(USER_ID)).defaultRegion).toBe("kotimaa");
  });

  it("stores each competition against the region that will read it", async () => {
    // The mapping is the part worth proving end to end: a column crossed with
    // another region would still round-trip through the action's own tests.
    await saveSettings(
      form({
        defaultCompetitionDomestic: "M1L",
        defaultCompetitionForeign: "BL1",
        defaultCompetitionNational: "EC",
      })
    );

    const stored = await getPreferencesFor(USER_ID);

    expect(preferredCompetitionFor("kotimaa", stored)).toBe("M1L");
    expect(preferredCompetitionFor("ulkomaat", stored)).toBe("BL1");
    expect(preferredCompetitionFor("maajoukkueet", stored)).toBe("EC");
  });

  it("lets every preference be unset again", async () => {
    // The rule the whole feature is built on: no setting is a one-way door.
    await saveSettings(form({ defaultRegion: "kotimaa", defaultCompetitionDomestic: "M1L" }));

    await saveSettings(form({ defaultRegion: "", defaultCompetitionDomestic: "" }));

    expect((await getSessionExtrasFor(USER_ID)).defaultRegion).toBeNull();
    expect(preferredCompetitionFor("kotimaa", await getPreferencesFor(USER_ID))).toBeNull();
  });

  it("updates the existing row rather than adding a second", async () => {
    await saveSettings(form({ defaultRegion: "kotimaa" }));
    await saveSettings(form({ defaultRegion: "ulkomaat" }));

    const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, USER_ID));

    expect(rows).toHaveLength(1);
    expect((await getSessionExtrasFor(USER_ID)).defaultRegion).toBe("ulkomaat");
  });

  it("refuses to store a region nothing can resolve", async () => {
    await saveSettings(form({ defaultRegion: "eurooppa" }));

    expect((await getSessionExtrasFor(USER_ID)).defaultRegion).toBeNull();
  });

  it("keeps a competition that has left the registry out of the resolvers", async () => {
    // Stored as written — the registry can change under it — but never returned
    // as a competition to open.
    await saveSettings(form({ defaultCompetitionDomestic: "GONE" }));

    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, USER_ID));

    expect(row?.defaultCompetitionDomestic).toBe("GONE");
    expect(preferredCompetitionFor("kotimaa", await getPreferencesFor(USER_ID))).toBeNull();
  });
});
