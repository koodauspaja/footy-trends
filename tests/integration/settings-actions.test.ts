import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user, userPreferences } from "@/db/schema";
import { preferredCompetitionFor } from "@/lib/competition-preferences";
import { getDefaultRegionFor, getPreferencesFor } from "@/lib/preferences";
import { saveSettings } from "@/lib/settings-actions";

/**
 * The write path and the read path, against a real Postgres.
 *
 * Everything else tests one or the other in isolation: the action with a mocked
 * database, the resolvers with mocked preferences. Nothing proved the two agree
 * — that what `saveSettings` writes is what the pages later read. A column
 * mapped to the wrong region, or a value stored in a shape the reader cannot
 * parse, would pass every other test in the suite.
 *
 * Only the session is mocked, because a real one needs a Google sign-in.
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
    expect(await getDefaultRegionFor(USER_ID)).toBe("kotimaa");
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

    expect(await getDefaultRegionFor(USER_ID)).toBeNull();
    expect(preferredCompetitionFor("kotimaa", await getPreferencesFor(USER_ID))).toBeNull();
  });

  it("updates the existing row rather than adding a second", async () => {
    await saveSettings(form({ defaultRegion: "kotimaa" }));
    await saveSettings(form({ defaultRegion: "ulkomaat" }));

    const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, USER_ID));

    expect(rows).toHaveLength(1);
    expect(await getDefaultRegionFor(USER_ID)).toBe("ulkomaat");
  });

  it("refuses to store a region nothing can resolve", async () => {
    await saveSettings(form({ defaultRegion: "eurooppa" }));

    expect(await getDefaultRegionFor(USER_ID)).toBeNull();
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
