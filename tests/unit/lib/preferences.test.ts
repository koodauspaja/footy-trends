import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows, limit, logger } = vi.hoisted(() => {
  const rows = { current: [] as unknown[], throws: false };
  const limit = vi.fn(async () => {
    if (rows.throws) throw new Error("database down");
    return rows.current;
  });
  return { rows, limit, logger: { error: vi.fn() } };
});

// No real database: the CI unit job has no service containers, deliberately.
// `getSessionExtrasFor` reaches the same `limit` through two left joins, so the
// chain answers with or without them.
vi.mock("@/db", () => {
  const where = () => ({ limit });
  const joinable = () => ({ leftJoin: joinable, where });
  return { db: { select: () => ({ from: joinable }) } };
});
vi.mock("@/lib/logger", () => ({ logger }));
// The favourites are their own two queries and their own tests; here they only
// have to arrive on the payload.
vi.mock("@/lib/favourites", () => ({
  favouritesForSession: async () => ({ teams: ["taso:60731"], competitions: ["kotimaa:VL"] }),
}));

const ROW = {
  defaultRegion: "kotimaa",
  defaultCompetitionDomestic: "M1L",
  defaultCompetitionForeign: null,
  defaultCompetitionNational: null,
};

beforeEach(() => {
  vi.resetModules();
  rows.current = [];
  rows.throws = false;
  limit.mockClear();
  logger.error.mockClear();
});

describe("getPreferencesFor", () => {
  it("returns null when the reader has never saved anything", async () => {
    const { getPreferencesFor } = await import("@/lib/preferences");

    expect(await getPreferencesFor("user-1")).toBeNull();
  });

  it("maps a stored row, validating the region", async () => {
    rows.current = [ROW];
    const { getPreferencesFor } = await import("@/lib/preferences");

    expect(await getPreferencesFor("user-1")).toEqual({
      defaultRegion: "kotimaa",
      defaultCompetitionDomestic: "M1L",
      defaultCompetitionForeign: null,
      defaultCompetitionNational: null,
    });
  });
});

describe("getSessionExtrasFor", () => {
  const AVATAR_VERSION = "3f6c1a2e-9b40-4f5d-8a11-0d2c7e5b9a13";

  it("returns the stored region", async () => {
    rows.current = [{ defaultRegion: "ulkomaat", avatarVersion: null }];
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: "ulkomaat",
      avatarVersion: null,
      favoriteTeams: ["taso:60731"],
      favoriteCompetitions: ["kotimaa:VL"],
    });
  });

  it("returns the avatar's cache token", async () => {
    // The client builds `/api/avatar/me?v=…` from this. It is a random token
    // rather than a timestamp, because the path is the same for every reader
    // and the response is cached `private, immutable` for a year.
    rows.current = [{ defaultRegion: null, avatarVersion: AVATAR_VERSION }];
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: AVATAR_VERSION,
      favoriteTeams: ["taso:60731"],
      favoriteCompetitions: ["kotimaa:VL"],
    });
  });

  it("reads an avatar for a reader who has saved no preferences", async () => {
    // The two rows are independently optional. Joining from `user` is what
    // stops a missing preference row hiding a present avatar — a join from
    // `user_preferences` would return nothing at all here.
    rows.current = [{ defaultRegion: null, avatarVersion: AVATAR_VERSION }];
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: AVATAR_VERSION,
      favoriteTeams: ["taso:60731"],
      favoriteCompetitions: ["kotimaa:VL"],
    });
  });

  it("returns nothing when there is no row", async () => {
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: null,
      favoriteTeams: [],
      favoriteCompetitions: [],
    });
  });

  it("ignores a region that is no longer one of the three", async () => {
    rows.current = [{ defaultRegion: "eurooppa", avatarVersion: null }];
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: null,
      favoriteTeams: ["taso:60731"],
      favoriteCompetitions: ["kotimaa:VL"],
    });
  });

  it("swallows a database failure rather than breaking every session read", async () => {
    // This runs inside better-auth's `customSession`, so throwing here would
    // fail `/api/auth/get-session` and take the whole header down with it.
    rows.throws = true;
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: null,
      favoriteTeams: [],
      favoriteCompetitions: [],
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
