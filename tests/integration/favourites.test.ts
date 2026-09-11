import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { favoriteCompetition, favoriteTeam, matches, user } from "@/db/schema";
import { MAX_FAVOURITES_PER_KIND } from "@/lib/favourite-keys";
import {
  getFavouriteKeys,
  removeFavouriteTeam,
  resolveTeamNames,
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

  it("flips twice when two tabs toggle the same team at once, ending where it started", async () => {
    /**
     * What a toggle means, made honest by the row lock. Before it, both
     * transactions found nothing to delete and both inserted, and the unique
     * index quietly turned the second into a no-op — so a double press left the
     * team favourited by accident rather than by design.
     *
     * Each caller is still told what its own write did, so no tab shows a state
     * the database does not have. Two tabs are required: the button is disabled
     * while its own request is in flight.
     */
    const results = await Promise.all([
      toggleFavouriteTeam(USER_ID, "taso", 60731),
      toggleFavouriteTeam(USER_ID, "taso", 60731),
    ]);

    expect(results.map((result) => result.ok && result.favorite).toSorted()).toEqual([false, true]);
    expect(await db.select().from(favoriteTeam).where(eq(favoriteTeam.userId, USER_ID))).toEqual(
      []
    );
  });

  it("does not let two concurrent toggles both pass the cap", async () => {
    /**
     * The race the row lock exists for, run for real: at forty-nine, two tabs
     * each count forty-nine and each insert, and the unique index does not
     * object because they are different teams. Without the lock this ends at
     * fifty-one; with it, one of the two is refused.
     *
     * Both toggles are started before either is awaited — awaiting the first
     * would serialise them and assert nothing.
     */
    await db.insert(favoriteTeam).values(
      Array.from({ length: MAX_FAVOURITES_PER_KIND - 1 }, (_unused, index) => ({
        userId: USER_ID,
        source: "taso",
        teamProviderId: 1000 + index,
      }))
    );

    const results = await Promise.all([
      toggleFavouriteTeam(USER_ID, "taso", 8001),
      toggleFavouriteTeam(USER_ID, "taso", 8002),
    ]);

    const rows = await db.select().from(favoriteTeam).where(eq(favoriteTeam.userId, USER_ID));
    expect(rows).toHaveLength(MAX_FAVOURITES_PER_KIND);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, reason: "limit" });
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

describe("resolving a team's name", () => {
  /** A provider id nothing else in the suite uses, so these rows stand alone. */
  const RENAMED = 987_654;
  const PROVIDER_MATCH_IDS = [997_001, 997_002];

  function matchRow(overrides: Partial<typeof matches.$inferInsert>) {
    return {
      providerMatchId: 997_001,
      competitionCode: "PL",
      seasonId: 2026,
      kickoffAt: new Date("2026-08-01T15:00:00Z"),
      matchday: 1,
      status: "FINISHED",
      stage: null,
      groupName: null,
      regularTimeHome: null,
      regularTimeAway: null,
      extraTimeHome: null,
      extraTimeAway: null,
      penaltiesHome: null,
      penaltiesAway: null,
      homeTeamProviderId: RENAMED,
      homeTeamName: "Old Name FC",
      awayTeamProviderId: 111_111,
      awayTeamName: "Someone Else",
      homeGoals: 1,
      awayGoals: 0,
      ...overrides,
    };
  }

  afterEach(async () => {
    await db.delete(matches).where(inArray(matches.providerMatchId, PROVIDER_MATCH_IDS));
  });

  it("gives the newest name a club played under, not whichever row came back last", async () => {
    /**
     * Only a real database can check this: the ordering lives in the SQL, so a
     * mock returns the rows it was handed whatever the query says. A club that
     * renamed has matches stored under both names, and resolving names on read
     * exists precisely so the current one shows.
     */
    await db.insert(matches).values([
      matchRow({ providerMatchId: 997_001, kickoffAt: new Date("2024-08-01T15:00:00Z") }),
      matchRow({
        providerMatchId: 997_002,
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
        homeTeamName: "New Name FC",
      }),
    ]);

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: RENAMED }])).toEqual([
      {
        source: "football-data",
        teamProviderId: RENAMED,
        name: "New Name FC",
        region: "ulkomaat",
        // Carried since specs/027, from the same row the name comes from.
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
      },
    ]);
  });

  it("looks at both sides, and still takes the newer", async () => {
    // The newer appearance is an away one here, so a query that only read the
    // home side — or merged the two by side rather than by date — would answer
    // with the older name.
    await db.insert(matches).values([
      matchRow({ providerMatchId: 997_001, kickoffAt: new Date("2024-08-01T15:00:00Z") }),
      matchRow({
        providerMatchId: 997_002,
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
        homeTeamProviderId: 111_111,
        homeTeamName: "Someone Else",
        awayTeamProviderId: RENAMED,
        awayTeamName: "New Name FC",
      }),
    ]);

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: RENAMED }])).toEqual([
      {
        source: "football-data",
        teamProviderId: RENAMED,
        name: "New Name FC",
        region: "ulkomaat",
        // Carried since specs/027, from the same row the name comes from.
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
      },
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
