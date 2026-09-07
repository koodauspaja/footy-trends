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
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit }) }) }) },
}));
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

describe("getDefaultRegionFor", () => {
  it("returns the stored region", async () => {
    rows.current = [{ defaultRegion: "ulkomaat" }];
    const { getDefaultRegionFor } = await import("@/lib/preferences");

    expect(await getDefaultRegionFor("user-1")).toBe("ulkomaat");
  });

  it("returns null when there is no row", async () => {
    const { getDefaultRegionFor } = await import("@/lib/preferences");

    expect(await getDefaultRegionFor("user-1")).toBeNull();
  });

  it("ignores a region that is no longer one of the three", async () => {
    rows.current = [{ defaultRegion: "eurooppa" }];
    const { getDefaultRegionFor } = await import("@/lib/preferences");

    expect(await getDefaultRegionFor("user-1")).toBeNull();
  });

  it("swallows a database failure rather than breaking every session read", async () => {
    // This runs inside better-auth's `customSession`, so throwing here would
    // fail `/api/auth/get-session` and take the whole header down with it.
    rows.throws = true;
    const { getDefaultRegionFor } = await import("@/lib/preferences");

    expect(await getDefaultRegionFor("user-1")).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});
