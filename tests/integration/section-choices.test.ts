import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sectionChoice, user } from "@/db/schema";
import { readSectionChoices, writeSectionChoice } from "@/lib/section-choices";

/**
 * A reader's section choices against a real Postgres: a choice round trips, a
 * second save of the same section replaces the first, each kind of page and
 * reader keeps its own, and the cascade removes them with the user.
 *
 * decisions/071-section-toggles.md
 */

const USER_ID = "itest-sections-user";
const OTHER_ID = "itest-sections-other";

async function insertUser(id: string, email: string) {
  await db.insert(user).values({ id, name: "Integration Reader", email, emailVerified: true });
}

beforeEach(async () => {
  await insertUser(USER_ID, "itest-sections@example.com");
  await insertUser(OTHER_ID, "itest-sections-other@example.com");
});

afterEach(async () => {
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.delete(user).where(eq(user.id, OTHER_ID));
});

describe("section choices", () => {
  it("round trips a choice through the database", async () => {
    await writeSectionChoice(USER_ID, "team", "analytics-other-seasons", false);

    expect(await readSectionChoices(USER_ID, "team")).toEqual({
      "analytics-other-seasons": false,
    });
  });

  it("replaces an earlier choice for the same section, so the last save wins", async () => {
    await writeSectionChoice(USER_ID, "team", "analytics", true);
    await writeSectionChoice(USER_ID, "team", "analytics", false);

    expect(await readSectionChoices(USER_ID, "team")).toEqual({ analytics: false });
    const rows = await db.select().from(sectionChoice).where(eq(sectionChoice.userId, USER_ID));
    expect(rows).toHaveLength(1);
  });

  it("keeps each kind of page's choices, and each reader's, apart", async () => {
    await writeSectionChoice(USER_ID, "team", "analytics", true);
    await writeSectionChoice(USER_ID, "standings", "analytics", false);
    await writeSectionChoice(OTHER_ID, "team", "analytics", false);

    expect(await readSectionChoices(USER_ID, "team")).toEqual({ analytics: true });
    expect(await readSectionChoices(USER_ID, "standings")).toEqual({ analytics: false });
    expect(await readSectionChoices(USER_ID, "national-team")).toEqual({});
    expect(await readSectionChoices(OTHER_ID, "team")).toEqual({ analytics: false });
  });

  it("removes a reader's choices with their account", async () => {
    await writeSectionChoice(USER_ID, "team", "matches", false);
    await writeSectionChoice(USER_ID, "standings", "knockout", true);

    await db.delete(user).where(eq(user.id, USER_ID));

    const rows = await db.select().from(sectionChoice).where(eq(sectionChoice.userId, USER_ID));
    expect(rows).toEqual([]);
  });
});
