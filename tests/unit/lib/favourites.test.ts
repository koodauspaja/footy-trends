import { beforeEach, describe, expect, it, vi } from "vitest";
import { favoriteCompetition, favoriteTeam, matches, tasoMatches } from "@/db/schema";

const { state, logger } = vi.hoisted(() => ({
  state: {
    rows: new Map<unknown, unknown[]>(),
    counts: new Map<unknown, number>(),
    deleted: new Map<unknown, unknown[]>(),
    inserts: [] as { table: unknown; values: unknown }[],
    emptyCount: false,
    locks: 0,
    limits: [] as number[],
    queried: [] as unknown[],
    throws: false,
  },
  logger: { error: vi.fn() },
}));

/**
 * No real database: the CI unit job has no service containers, deliberately.
 * The chain below answers the three shapes `favourites.ts` uses, and tells them
 * apart by shape rather than by table — `.limit()` is the bounded list read,
 * a bare `await` on `select` is the count, and `selectDistinct` is a name lookup.
 */
vi.mock("@/db", () => {
  const rowsFor = (table: unknown) => {
    if (state.throws) throw new Error("database down");
    state.queried.push(table);
    return state.rows.get(table) ?? [];
  };
  const thenable = (rows: () => unknown[], bare: () => unknown[]) => ({
    limit: async (n: number) => {
      state.limits.push(n);
      return rows();
    },
    // biome-ignore lint/suspicious/noThenProperty: drizzle's query builder is itself a thenable — awaiting it is what runs the query — so a stand-in for it has to be one too
    then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve().then(bare).then(resolve, reject),
  });

  const client = {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          thenable(
            () => rowsFor(table),
            // A bare `await` on a `select` is `countFor`; the bounded list
            // read always ends in `.limit()`.
            () => {
              if (state.throws) throw new Error("database down");
              return state.emptyCount ? [] : [{ n: state.counts.get(table) ?? 0 }];
            }
          ),
      }),
    }),
    selectDistinct: () => ({
      from: (table: unknown) => ({
        where: () =>
          thenable(
            () => rowsFor(table),
            () => rowsFor(table)
          ),
      }),
    }),
    delete: (table: unknown) => ({
      where: () => ({ returning: async () => state.deleted.get(table) ?? [] }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoNothing: async () => state.inserts.push({ table, values }),
      }),
    }),
    // The row lock the cap depends on. Recorded rather than ignored: a toggle
    // that stopped taking it would still pass every other assertion here.
    execute: async () => {
      state.locks += 1;
    },
  };

  return {
    db: {
      ...client,
      transaction: async (run: (tx: typeof client) => Promise<unknown>) => run(client),
    },
  };
});
vi.mock("@/lib/logger", () => ({ logger }));

beforeEach(() => {
  state.rows.clear();
  state.counts.clear();
  state.deleted.clear();
  state.inserts = [];
  state.limits = [];
  state.queried = [];
  state.throws = false;
  state.emptyCount = false;
  state.locks = 0;
  logger.error.mockClear();
});

describe("getFavouriteKeys", () => {
  it("returns both lists as keys", async () => {
    state.rows.set(favoriteTeam, [{ source: "taso", teamProviderId: 60731 }]);
    state.rows.set(favoriteCompetition, [{ region: "kotimaa", competitionCode: "VL" }]);
    const { getFavouriteKeys } = await import("@/lib/favourites");

    expect(await getFavouriteKeys("user-1")).toEqual({
      teams: ["taso:60731"],
      competitions: ["kotimaa:VL"],
    });
  });

  it("asks the database for no more than the cap, of either kind", async () => {
    // Without this the session payload has no ceiling: a row written before the
    // cap existed, or by a second tab racing it, would ride along unbounded.
    const { getFavouriteKeys, MAX_FAVOURITES_PER_KIND } = {
      ...(await import("@/lib/favourites")),
      ...(await import("@/lib/favourite-keys")),
    };
    await getFavouriteKeys("user-1");

    expect(state.limits).toEqual([MAX_FAVOURITES_PER_KIND, MAX_FAVOURITES_PER_KIND]);
  });
});

describe("toggleFavouriteTeam", () => {
  it("adds one that is not there", async () => {
    const { toggleFavouriteTeam } = await import("@/lib/favourites");

    expect(await toggleFavouriteTeam("user-1", "taso", 60731)).toEqual({
      ok: true,
      favorite: true,
    });
    expect(state.inserts).toEqual([
      { table: favoriteTeam, values: { userId: "user-1", source: "taso", teamProviderId: 60731 } },
    ]);
  });

  it("removes one that is, and does not then insert it back", async () => {
    state.deleted.set(favoriteTeam, [{ id: "row-1" }]);
    const { toggleFavouriteTeam } = await import("@/lib/favourites");

    expect(await toggleFavouriteTeam("user-1", "taso", 60731)).toEqual({
      ok: true,
      favorite: false,
    });
    expect(state.inserts).toEqual([]);
  });

  it("refuses the fifty-first", async () => {
    state.counts.set(favoriteTeam, 50);
    const { toggleFavouriteTeam } = await import("@/lib/favourites");

    expect(await toggleFavouriteTeam("user-1", "taso", 60731)).toEqual({
      ok: false,
      reason: "limit",
    });
    expect(state.inserts).toEqual([]);
  });

  it("treats a count that came back with no row as none", async () => {
    // `count(*)` always returns a row, but the driver's type does not say so;
    // reading the absent case as "at the cap" would refuse every first
    // favourite in the app.
    state.emptyCount = true;
    const { toggleFavouriteTeam } = await import("@/lib/favourites");

    expect(await toggleFavouriteTeam("user-1", "taso", 60731)).toEqual({
      ok: true,
      favorite: true,
    });
  });

  it("takes the reader's row lock before counting, so two tabs cannot both pass the cap", async () => {
    /**
     * Counting and then inserting is two statements: at forty-nine, two tabs
     * both read forty-nine and both insert, and the unique index does not
     * object because they are different favourites. The lock is the only thing
     * that stops fifty-one.
     */
    const { toggleFavouriteTeam } = await import("@/lib/favourites");
    await toggleFavouriteTeam("user-1", "taso", 60731);

    expect(state.locks).toBe(1);
  });

  it("still lets a reader at the cap remove one", async () => {
    // The reason the count comes after the delete: checking first would strand
    // someone at fifty with no way down.
    state.counts.set(favoriteTeam, 50);
    state.deleted.set(favoriteTeam, [{ id: "row-1" }]);
    const { toggleFavouriteTeam } = await import("@/lib/favourites");

    expect(await toggleFavouriteTeam("user-1", "taso", 60731)).toEqual({
      ok: true,
      favorite: false,
    });
  });
});

describe("toggleFavouriteCompetition", () => {
  it("adds one that is not there", async () => {
    const { toggleFavouriteCompetition } = await import("@/lib/favourites");

    expect(await toggleFavouriteCompetition("user-1", "kotimaa", "VL")).toEqual({
      ok: true,
      favorite: true,
    });
    expect(state.inserts).toEqual([
      {
        table: favoriteCompetition,
        values: { userId: "user-1", region: "kotimaa", competitionCode: "VL" },
      },
    ]);
  });

  it("removes one that is", async () => {
    state.deleted.set(favoriteCompetition, [{ id: "row-1" }]);
    const { toggleFavouriteCompetition } = await import("@/lib/favourites");

    expect(await toggleFavouriteCompetition("user-1", "kotimaa", "VL")).toEqual({
      ok: true,
      favorite: false,
    });
    expect(state.inserts).toEqual([]);
  });

  it("refuses the fifty-first", async () => {
    state.counts.set(favoriteCompetition, 50);
    const { toggleFavouriteCompetition } = await import("@/lib/favourites");

    expect(await toggleFavouriteCompetition("user-1", "kotimaa", "VL")).toEqual({
      ok: false,
      reason: "limit",
    });
    expect(state.inserts).toEqual([]);
  });
});

describe("removing directly", () => {
  it("is not an error when there was nothing to remove", async () => {
    // `/suosikit` removes by key, and the same key can arrive twice from two
    // tabs; the second must be a no-op rather than a failure the page reports.
    const { removeFavouriteCompetition, removeFavouriteTeam } = await import("@/lib/favourites");

    await expect(removeFavouriteTeam("user-1", "taso", 60731)).resolves.toBeUndefined();
    await expect(removeFavouriteCompetition("user-1", "kotimaa", "VL")).resolves.toBeUndefined();
  });
});

describe("favouritesForSession", () => {
  it("passes the keys through", async () => {
    state.rows.set(favoriteTeam, [{ source: "football-data", teamProviderId: 86 }]);
    const { favouritesForSession } = await import("@/lib/favourites");

    expect(await favouritesForSession("user-1")).toEqual({
      teams: ["football-data:86"],
      competitions: [],
    });
  });

  it("gives up quietly when the read fails", async () => {
    // This runs inside better-auth's `customSession`: throwing would take the
    // whole session response down, and with it the reader's header.
    state.throws = true;
    const { favouritesForSession } = await import("@/lib/favourites");

    expect(await favouritesForSession("user-1")).toEqual({ teams: [], competitions: [] });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("resolveTeamNames", () => {
  it("names a team from either side of a stored match", async () => {
    state.rows.set(tasoMatches, [
      { homeId: 60731, homeName: "FC Kiisto", awayId: 60999, awayName: "Vieras" },
      { homeId: 61000, homeName: "Koti", awayId: 60732, awayName: "PK-35" },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(
      await resolveTeamNames([
        { source: "taso", teamProviderId: 60731 },
        { source: "taso", teamProviderId: 60732 },
      ])
    ).toEqual([
      { source: "taso", teamProviderId: 60731, name: "FC Kiisto", region: "kotimaa" },
      { source: "taso", teamProviderId: 60732, name: "PK-35", region: "kotimaa" },
    ]);
  });

  it("keeps the two providers' id spaces apart", async () => {
    // 317 is a real id in both tables and a different club in each. Resolving
    // by id alone would print one club's name over the other's row.
    state.rows.set(matches, [
      { homeId: 317, homeName: "Rangers", awayId: 1, awayName: "Muu", competitionCode: "PL" },
    ]);
    state.rows.set(tasoMatches, [{ homeId: 317, homeName: "Ilves", awayId: 2, awayName: "Muu" }]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(
      await resolveTeamNames([
        { source: "football-data", teamProviderId: 317 },
        { source: "taso", teamProviderId: 317 },
      ])
    ).toEqual([
      { source: "football-data", teamProviderId: 317, name: "Rangers", region: "ulkomaat" },
      { source: "taso", teamProviderId: 317, name: "Ilves", region: "kotimaa" },
    ]);
  });

  it("reports a team with no stored match as nameless rather than dropping it", async () => {
    // A favourite nobody can see is a favourite nobody can remove.
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "taso", teamProviderId: 60731 }])).toEqual([
      { source: "taso", teamProviderId: 60731, name: null, region: null },
    ]);
  });

  it("sends a national side to its own region, not to the club pages", async () => {
    /**
     * The bug this exists for: `football-data` covers club competitions *and*
     * national sides, and the same standings page renders both, so both can be
     * favourited. Linking every football-data team to `/ulkomaat/joukkue/:id`
     * sent Suomi to a club URL.
     */
    state.rows.set(matches, [
      { homeId: 8722, homeName: "Suomi", awayId: 759, awayName: "Ruotsi", competitionCode: "WC" },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: 8722 }])).toEqual([
      { source: "football-data", teamProviderId: 8722, name: "Suomi", region: "maajoukkueet" },
    ]);
  });

  it("keeps the first region it saw when a team has matches in two competitions", async () => {
    // Deterministic rather than last-write-wins: a club plays several club
    // competitions, and all of them are `ulkomaat`, so the only thing that must
    // not happen is the answer changing with row order.
    state.rows.set(matches, [
      { homeId: 86, homeName: "Real Madrid", awayId: 81, awayName: "Barca", competitionCode: "PD" },
      { homeId: 86, homeName: "Real Madrid", awayId: 5, awayName: "Bayern", competitionCode: "CL" },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: 86 }])).toEqual([
      { source: "football-data", teamProviderId: 86, name: "Real Madrid", region: "ulkomaat" },
    ]);
  });

  it("reports no region for a competition the registry no longer has", async () => {
    // Better an unlinked row than a link to another club's page.
    state.rows.set(matches, [
      { homeId: 86, homeName: "Real Madrid", awayId: 81, awayName: "Barca", competitionCode: "XX" },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: 86 }])).toEqual([
      { source: "football-data", teamProviderId: 86, name: "Real Madrid", region: null },
    ]);
  });

  it("does not query a provider nobody favourited", async () => {
    state.rows.set(matches, []);
    const { resolveTeamNames } = await import("@/lib/favourites");
    await resolveTeamNames([{ source: "football-data", teamProviderId: 86 }]);

    expect(state.queried).toEqual([matches]);
  });

  it("queries nothing at all for an empty list", async () => {
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([])).toEqual([]);
    expect(state.queried).toEqual([]);
  });
});
