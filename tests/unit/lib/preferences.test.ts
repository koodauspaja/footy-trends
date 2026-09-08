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
  const AVATAR_AT = new Date("2026-09-08T10:00:00Z");

  it("returns the stored region", async () => {
    rows.current = [{ defaultRegion: "ulkomaat", avatarUpdatedAt: null }];
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: "ulkomaat",
      avatarVersion: null,
    });
  });

  it("returns the avatar version as epoch milliseconds", async () => {
    // The client builds `/api/avatar/me?v=…` from this, which is what makes an
    // `immutable` response safe: a new upload is a new URL.
    rows.current = [{ defaultRegion: null, avatarUpdatedAt: AVATAR_AT }];
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: AVATAR_AT.getTime(),
    });
  });

  it("reads an avatar for a reader who has saved no preferences", async () => {
    // The two rows are independently optional. Joining from `user` is what
    // stops a missing preference row hiding a present avatar — a join from
    // `user_preferences` would return nothing at all here.
    rows.current = [{ defaultRegion: null, avatarUpdatedAt: AVATAR_AT }];
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: AVATAR_AT.getTime(),
    });
  });

  it("returns nothing when there is no row", async () => {
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: null,
    });
  });

  it("ignores a region that is no longer one of the three", async () => {
    rows.current = [{ defaultRegion: "eurooppa", avatarUpdatedAt: null }];
    const { getSessionExtrasFor } = await import("@/lib/preferences");

    expect(await getSessionExtrasFor("user-1")).toEqual({
      defaultRegion: null,
      avatarVersion: null,
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
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
