import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { favoriteCompetition, favoriteTeam, user } from "@/db/schema";
import { MAX_FAVOURITES_PER_KIND } from "@/lib/favourite-keys";
import {
  getFavouriteKeys,
  removeFavouriteTeam,
  toggleFavouriteCompetition,
  toggleFavouriteTeam,
} from "@/lib/favourites";
import { getSessionExtrasFor } from "@/lib/preferences";

/**
 * Favourites against a real Postgres, from specs/026-favourites.md.
 *
 * Three things here cannot be tested anywhere else: the unique index really
 * makes a repeat a no-op rather than a second row, the cascade really removes
 * both kinds with the user — specs/024 promises account deletion is complete —
 * and the two providers' identical ids really coexist as separate rows.
 */

const USER_ID = "itest-fav-user";
const OTHER_ID = "itest-fav-other";

async function insertUser(id: string, email: string) {
  await db.insert(user).values({ id, name: "Integration Reader", email, emailVerified: true });
}

beforeEach(async () => {
  await insertUser(USER_ID, "itest-fav@example.com");
  await insertUser(OTHER_ID, "itest-fav-other@example.com");
});

afterEach(async () => {
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.delete(user).where(eq(user.id, OTHER_ID));
});

describe("favourite teams", () => {
  it("round trips a favourite through the database", async () => {
    await toggleFavouriteTeam(USER_ID, "taso", 60731);

    expect(await getFavouriteKeys(USER_ID)).toEqual({
      teams: ["taso:60731"],
      competitions: [],
    });
  });

  it("toggles back off", async () => {
    await toggleFavouriteTeam(USER_ID, "taso", 60731);
    expect(await toggleFavouriteTeam(USER_ID, "taso", 60731)).toEqual({
      ok: true,
      favorite: false,
    });

    const rows = await db.select().from(favoriteTeam).where(eq(favoriteTeam.userId, USER_ID));
    expect(rows).toEqual([]);
  });

  it("keeps the same id from the two providers as two rows", async () => {
    // 317 exists in both `matches` and `taso_matches` and is a different club
    // in each. If the identity were the id alone, one would silently replace
    // the other — or the unique index would refuse the second.
    await toggleFavouriteTeam(USER_ID, "taso", 317);
    await toggleFavouriteTeam(USER_ID, "football-data", 317);

    const keys = await getFavouriteKeys(USER_ID);
    expect(keys.teams.toSorted()).toEqual(["football-data:317", "taso:317"]);
  });

  it("keeps two readers' favourites apart", async () => {
    await toggleFavouriteTeam(USER_ID, "taso", 60731);
    await toggleFavouriteTeam(OTHER_ID, "taso", 60731);

    // Same team, two rows: the identity includes the reader.
    expect((await getFavouriteKeys(USER_ID)).teams).toEqual(["taso:60731"]);
    expect((await getFavouriteKeys(OTHER_ID)).teams).toEqual(["taso:60731"]);
  });

  it("makes a direct repeat insert a no-op rather than an error", async () => {
    // What two tabs, or a double click, actually do: both `delete`s find
    // nothing, and both `insert`s run. The index is what keeps that to one row.
    await db
      .insert(favoriteTeam)
      .values({ userId: USER_ID, source: "taso", teamProviderId: 60731 });
    await db
      .insert(favoriteTeam)
      .values({ userId: USER_ID, source: "taso", teamProviderId: 60731 })
      .onConflictDoNothing();

    const rows = await db.select().from(favoriteTeam).where(eq(favoriteTeam.userId, USER_ID));
    expect(rows).toHaveLength(1);
  });

  it("refuses the one past the cap, and lets a removal through at it", async () => {
    // Written straight to the table: the point is the count the toggle reads,
    // not fifty round trips through it.
    await db.insert(favoriteTeam).values(
      Array.from({ length: MAX_FAVOURITES_PER_KIND }, (_unused, index) => ({
        userId: USER_ID,
        source: "taso",
        teamProviderId: 1000 + index,
      }))
    );

    expect(await toggleFavouriteTeam(USER_ID, "taso", 9999)).toEqual({
      ok: false,
      reason: "limit",
    });
    // At the cap and still able to get out of it.
    expect(await toggleFavouriteTeam(USER_ID, "taso", 1000)).toEqual({
      ok: true,
      favorite: false,
    });
  });

  it("removes one that is not there without complaining", async () => {
    await expect(removeFavouriteTeam(USER_ID, "taso", 60731)).resolves.toBeUndefined();
  });
});

describe("favourite competitions", () => {
  it("round trips", async () => {
    await toggleFavouriteCompetition(USER_ID, "kotimaa", "VL");

    expect(await getFavouriteKeys(USER_ID)).toEqual({
      teams: [],
      competitions: ["kotimaa:VL"],
    });
  });

  it("keeps the same code in two regions apart", async () => {
    await toggleFavouriteCompetition(USER_ID, "kotimaa", "VL");
    await toggleFavouriteCompetition(USER_ID, "ulkomaat", "VL");

    expect((await getFavouriteKeys(USER_ID)).competitions.toSorted()).toEqual([
      "kotimaa:VL",
      "ulkomaat:VL",
    ]);
  });
});

describe("deleting the account", () => {
  it("takes both kinds of favourite with it", async () => {
    // specs/024 promises account deletion is complete. An orphaned favourite
    // would make that false, and the row would outlive the user it names.
    await toggleFavouriteTeam(USER_ID, "taso", 60731);
    await toggleFavouriteCompetition(USER_ID, "kotimaa", "VL");

    await db.delete(user).where(eq(user.id, USER_ID));

    expect(await db.select().from(favoriteTeam).where(eq(favoriteTeam.userId, USER_ID))).toEqual(
      []
    );
    expect(
      await db.select().from(favoriteCompetition).where(eq(favoriteCompetition.userId, USER_ID))
    ).toEqual([]);
  });
});

describe("the session payload", () => {
  it("carries both lists, for a reader with no preferences row at all", async () => {
    // The favourites are a second round trip beside the preferences join, so a
    // reader who has never opened the settings page still gets their stars.
    await toggleFavouriteTeam(USER_ID, "taso", 60731);
    await toggleFavouriteCompetition(USER_ID, "kotimaa", "VL");

    expect(await getSessionExtrasFor(USER_ID)).toEqual({
      defaultRegion: null,
      avatarVersion: null,
      favoriteTeams: ["taso:60731"],
      favoriteCompetitions: ["kotimaa:VL"],
    });
  });
});
