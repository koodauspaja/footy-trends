import { beforeEach, describe, expect, it, vi } from "vitest";
import { favoriteCompetition, favoriteTeam, matches } from "@/db/schema";

const { state, logger } = vi.hoisted(() => ({
  state: {
    rows: new Map<unknown, unknown[]>(),
    sides: new Map<string, unknown[]>(),
    nationalCategories: [] as { id: number; category: string }[],
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
    /**
     * `distinct on` is per side — one query for home, one for away — so the
     * mock keys rows by side too. Anything less could not tell "found the team
     * playing away" from "found nothing", which is half of what these tests
     * are about.
     */
    /**
     * The Finland lookup from #325: one `selectDistinct(...).union(...)` over
     * both sides, asked only when a candidate exists. Rows come from
     * `state.nationalCategories`.
     */
    selectDistinct: () => ({
      from: () => ({
        where: () => {
          const rows = state.nationalCategories;
          return {
            union: async () => rows,
            // biome-ignore lint/suspicious/noThenProperty: drizzle's builder is a thenable
            then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
          };
        },
      }),
    }),
    selectDistinctOn: (columns: { name: string }[]) => ({
      from: (table: unknown) => ({
        where: () => ({
          orderBy: async () => {
            const side = columns[0]?.name.startsWith("home") === true ? "home" : "away";
            const key = `${table === matches ? "matches" : "taso_matches"}:${side}`;
            if (state.throws) throw new Error("database down");
            state.queried.push(key);
            return state.sides.get(key) ?? [];
          },
        }),
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
  state.sides.clear();
  state.nationalCategories = [];
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
  const at = (iso: string) => new Date(iso);

  it("names a team from whichever side it played", async () => {
    state.sides.set("taso_matches:home", [
      {
        id: 60731,
        name: "FC Kiisto",
        competitionCode: "VL",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    state.sides.set("taso_matches:away", [
      {
        id: 60732,
        name: "PK-35",
        competitionCode: "VL",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(
      await resolveTeamNames([
        { source: "taso", teamProviderId: 60731 },
        { source: "taso", teamProviderId: 60732 },
      ])
    ).toEqual([
      {
        source: "taso",
        teamProviderId: 60731,
        name: "FC Kiisto",
        region: "kotimaa",
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: "/kotimaa/joukkue/60731",
      },
      {
        source: "taso",
        teamProviderId: 60732,
        name: "PK-35",
        region: "kotimaa",
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: "/kotimaa/joukkue/60732",
      },
    ]);
  });

  it("prefers the more recent of a team's two sides", async () => {
    /**
     * A club that renamed has matches stored under both names. The newer one is
     * the current one, and picking it is the whole reason names are resolved on
     * read rather than written onto the favourite.
     */
    state.sides.set("matches:home", [
      {
        id: 86,
        name: "Old Name FC",
        competitionCode: "PD",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2024-05-01"),
      },
    ]);
    state.sides.set("matches:away", [
      {
        id: 86,
        name: "New Name FC",
        competitionCode: "PD",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: 86 }])).toEqual([
      {
        source: "football-data",
        teamProviderId: 86,
        name: "New Name FC",
        region: "ulkomaat",
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: "/ulkomaat/joukkue/86",
      },
    ]);
  });

  it("keeps the older name when the older match is the away one", async () => {
    // The same assertion with the sides swapped: the answer must come from the
    // dates, not from the order the two queries happen to be merged in.
    state.sides.set("matches:home", [
      {
        id: 86,
        name: "New Name FC",
        competitionCode: "PD",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    state.sides.set("matches:away", [
      {
        id: 86,
        name: "Old Name FC",
        competitionCode: "PD",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2024-05-01"),
      },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: 86 }])).toEqual([
      {
        source: "football-data",
        teamProviderId: 86,
        name: "New Name FC",
        region: "ulkomaat",
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: "/ulkomaat/joukkue/86",
      },
    ]);
  });

  it("keeps the two providers' id spaces apart", async () => {
    // 317 is a real id in both tables and a different club in each. Resolving
    // by id alone would print one club's name over the other's row.
    state.sides.set("matches:home", [
      {
        id: 317,
        name: "Rangers",
        competitionCode: "PL",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    state.sides.set("taso_matches:home", [
      {
        id: 317,
        name: "Ilves",
        competitionCode: "VL",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(
      await resolveTeamNames([
        { source: "football-data", teamProviderId: 317 },
        { source: "taso", teamProviderId: 317 },
      ])
    ).toEqual([
      {
        source: "football-data",
        teamProviderId: 317,
        name: "Rangers",
        region: "ulkomaat",
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: "/ulkomaat/joukkue/317",
      },
      {
        source: "taso",
        teamProviderId: 317,
        name: "Ilves",
        region: "kotimaa",
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: "/kotimaa/joukkue/317",
      },
    ]);
  });

  it("sends a national side to its own region, not to the club pages", async () => {
    /**
     * `football-data` covers club competitions *and* national sides, and the
     * same standings page renders both, so both can be favourited. Linking
     * every football-data team to `/ulkomaat/joukkue/:id` sent Suomi to a club
     * URL.
     */
    state.sides.set("matches:home", [
      {
        id: 8722,
        name: "Suomi",
        competitionCode: "WC",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: 8722 }])).toEqual([
      {
        source: "football-data",
        teamProviderId: 8722,
        name: "Suomi",
        region: "maajoukkueet",
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: "/maajoukkueet/joukkue/8722",
      },
    ]);
  });

  it("takes the region from the most recent competition, as it takes the name", async () => {
    // One row per team per side, so the region and the name always come from
    // the same match — they cannot disagree.
    state.sides.set("matches:home", [
      {
        id: 8722,
        name: "Suomi",
        competitionCode: "PL",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2020-05-01"),
      },
    ]);
    state.sides.set("matches:away", [
      {
        id: 8722,
        name: "Suomi",
        competitionCode: "WC",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: 8722 }])).toEqual([
      {
        source: "football-data",
        teamProviderId: 8722,
        name: "Suomi",
        region: "maajoukkueet",
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: "/maajoukkueet/joukkue/8722",
      },
    ]);
  });

  it("reports no region for a competition the registry no longer has", async () => {
    // Better an unlinked row than a link to another club's page.
    state.sides.set("matches:home", [
      {
        id: 86,
        name: "Real Madrid",
        competitionCode: "XX",
        bucket: null,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "football-data", teamProviderId: 86 }])).toEqual([
      {
        source: "football-data",
        teamProviderId: 86,
        name: "Real Madrid",
        region: null,
        competitionCode: expect.any(String),
        seasonId: expect.any(Number),
        href: null,
      },
    ]);
  });

  it.each([
    ["a national-team bucket", "maajp2026", null],
    ["next year's national-team bucket, unlisted anywhere", "maajp2031", null],
    ["a club bucket", "spljp26", "kotimaa"],
  ])("gives a TASO team from %s the region %s", async (_case, bucket, expected) => {
    /**
     * Only the club game has a TASO team page. `/maajoukkueet/joukkue/[id]` is
     * football-data's, and `/kotimaa/joukkue/[id]` is scoped to the domestic
     * bucket — so a national-team id would 404 on one and find nothing on the
     * other. Null makes it an unlinked row instead, which both `/suosikit` and
     * team search already render.
     *
     * The prefix is what is checked, not a list: TASO adds a bucket every year.
     */
    state.sides.set("taso_matches:home", [
      {
        id: 60731,
        name: "Suomi",
        competitionCode: "UNL",
        bucket,
        seasonId: 2026,
        kickoffAt: at("2026-05-01"),
      },
    ]);
    const { resolveTeamNames } = await import("@/lib/favourites");

    const [team] = await resolveTeamNames([{ source: "taso", teamProviderId: 60731 }]);

    expect(team?.region).toBe(expected);
  });

  describe("Finland's own pages, from #325", () => {
    const suomi = (bucket = "maajp2026") => {
      state.sides.set("taso_matches:home", [
        {
          id: 144368,
          name: "Suomi",
          competitionCode: "UNL",
          bucket,
          seasonId: 2026,
          kickoffAt: at("2026-05-01"),
        },
      ]);
    };

    it.each([
      ["the men's friendlies category", ["Miehet-A", "UNL"], "/maajoukkueet/huuhkajat"],
      ["the women's friendlies category", ["Naiset-A", "WUNL"], "/maajoukkueet/helmarit"],
    ])("links Finland to its own page from %s", async (_case, categories, expected) => {
      /**
       * `Miehet-A` and `Naiset-A` and not the tournament ids: both sides carry
       * an A-friendlies category in every bucket, while a `W` prefix only looks
       * like it marks the women's game — `WCQ` is the men's World Cup
       * qualifiers.
       */
      suomi();
      state.nationalCategories = categories.map((category) => ({ id: 144368, category }));
      const { resolveTeamNames } = await import("@/lib/favourites");

      const [team] = await resolveTeamNames([{ source: "taso", teamProviderId: 144368 }]);

      expect(team?.href).toBe(expected);
    });

    it.each([
      ["both, which cannot be one team", ["Miehet-A", "Naiset-A"]],
      ["neither, so nothing can be said", ["UNL", "WCQ"]],
      ["nothing at all", []],
    ])("leaves Finland unlinked when the categories say %s", async (_case, categories) => {
      // A wrong link is worse than none: it looks like it worked.
      suomi();
      state.nationalCategories = categories.map((category) => ({ id: 144368, category }));
      const { resolveTeamNames } = await import("@/lib/favourites");

      const [team] = await resolveTeamNames([{ source: "taso", teamProviderId: 144368 }]);

      expect(team?.href).toBeNull();
    });

    it("leaves Finland's opponents unlinked, whatever they played in", async () => {
      // They have no page in either provider, so there is nowhere to send them.
      state.sides.set("taso_matches:home", [
        {
          id: 147879,
          name: "Viro",
          competitionCode: "Miehet-A",
          bucket: "maajp2026",
          seasonId: 2026,
          kickoffAt: at("2026-05-01"),
        },
      ]);
      state.nationalCategories = [{ id: 147879, category: "Miehet-A" }];
      const { resolveTeamNames } = await import("@/lib/favourites");

      const [team] = await resolveTeamNames([{ source: "taso", teamProviderId: 147879 }]);

      expect(team?.href).toBeNull();
    });

    it("does not treat a club-bucket team called Suomi as the national side", async () => {
      // The bucket is what says national, not the name.
      suomi("spljp26");
      state.nationalCategories = [{ id: 144368, category: "Miehet-A" }];
      const { resolveTeamNames } = await import("@/lib/favourites");

      const [team] = await resolveTeamNames([{ source: "taso", teamProviderId: 144368 }]);

      expect(team?.href).toBe("/kotimaa/joukkue/144368");
    });

    it("does not ask for categories when no team could be Finland", async () => {
      // `resolveTeamNames` runs on every session read; the extra query is only
      // worth making when a candidate exists.
      state.sides.set("taso_matches:home", [
        {
          id: 60731,
          name: "FC Kiisto",
          competitionCode: "VL",
          bucket: "spljp26",
          seasonId: 2026,
          kickoffAt: at("2026-05-01"),
        },
      ]);
      state.nationalCategories = [{ id: 60731, category: "Miehet-A" }];
      const { resolveTeamNames } = await import("@/lib/favourites");

      const [team] = await resolveTeamNames([{ source: "taso", teamProviderId: 60731 }]);

      // The categories above would have produced a Huuhkajat link had they been read.
      expect(team?.href).toBe("/kotimaa/joukkue/60731");
    });
  });

  it("reports a team with no stored match as nameless rather than dropping it", async () => {
    // A favourite nobody can see is a favourite nobody can remove.
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([{ source: "taso", teamProviderId: 60731 }])).toEqual([
      {
        source: "taso",
        teamProviderId: 60731,
        name: null,
        region: null,
        competitionCode: null,
        seasonId: null,
        href: null,
      },
    ]);
  });

  it("does not query a provider nobody favourited", async () => {
    const { resolveTeamNames } = await import("@/lib/favourites");
    await resolveTeamNames([{ source: "football-data", teamProviderId: 86 }]);

    expect(state.queried).toEqual(["matches:home", "matches:away"]);
  });

  it("queries nothing at all for an empty list", async () => {
    const { resolveTeamNames } = await import("@/lib/favourites");

    expect(await resolveTeamNames([])).toEqual([]);
    expect(state.queried).toEqual([]);
  });
});
