import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The size warning from specs/025-custom-avatar.md.
 *
 * The reads and writes themselves are covered against a real database in
 * `tests/integration/avatar.test.ts` — a mocked query builder would prove
 * nothing about SQL. What is worth testing here is the diagnostic: when it
 * speaks, when it stays quiet, and that it cannot take an upload down with it.
 */

const { execute, insert, onConflictDoUpdate, returning, stored, rows, deleteWhere, logger } =
  vi.hoisted(() => {
    const execute = vi.fn();
    const stored = { current: new Date("2026-09-08T10:00:00Z") };
    const returning = vi.fn(async () => [{ updatedAt: stored.current }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values: () => ({ onConflictDoUpdate }) }));
    const rows = { current: [] as unknown[] };
    const deleteWhere = vi.fn(async () => undefined);
    return {
      execute,
      insert,
      onConflictDoUpdate,
      returning,
      stored,
      rows,
      deleteWhere,
      logger: { warn: vi.fn(), error: vi.fn() },
    };
  });

vi.mock("@/db", () => ({
  db: {
    execute,
    insert,
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => rows.current }) }),
    }),
    delete: () => ({ where: deleteWhere }),
  },
}));
vi.mock("@/lib/logger", () => ({ logger }));

const { deleteAvatar, getAvatar, saveAvatar } = await import("@/lib/avatar");

/** 10 % of 8 GB, the point the warning is written against. */
const THRESHOLD = (8 * 1024 * 1024 * 1024) / 10;

const BYTES = Buffer.from([1, 2, 3]);

beforeEach(() => {
  vi.clearAllMocks();
  execute.mockResolvedValue([{ bytes: "1024", count: "3" }]);
  rows.current = [];
});

describe("getAvatar", () => {
  it("reports the version as epoch milliseconds", async () => {
    // What the image URL carries, which is what makes a year-long `immutable`
    // response safe.
    const updatedAt = new Date("2026-09-08T10:00:00Z");
    rows.current = [{ bytes: BYTES, contentType: "image/webp", updatedAt }];

    expect(await getAvatar("user-1")).toEqual({
      bytes: BYTES,
      contentType: "image/webp",
      version: updatedAt.getTime(),
    });
  });

  it("returns null for a reader with no picture", async () => {
    expect(await getAvatar("user-1")).toBeNull();
  });
});

describe("deleteAvatar", () => {
  it("issues the delete", async () => {
    await deleteAvatar("user-1");

    expect(deleteWhere).toHaveBeenCalled();
  });
});

describe("saveAvatar", () => {
  it("says nothing while the table is a rounding error", async () => {
    // 21 MB of application data today, and this is measured after every
    // upload. A warning that fired routinely would be one nobody reads.
    await saveAvatar("user-1", BYTES, "image/webp");

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("stays quiet exactly at the threshold, and speaks past it", async () => {
    execute.mockResolvedValue([{ bytes: String(THRESHOLD), count: "1" }]);
    await saveAvatar("user-1", BYTES, "image/webp");
    expect(logger.warn).not.toHaveBeenCalled();

    execute.mockResolvedValue([{ bytes: String(THRESHOLD + 1), count: "33000" }]);
    await saveAvatar("user-1", BYTES, "image/webp");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tableBytes: THRESHOLD + 1, rows: 33000 }),
      expect.stringContaining("Railway volume")
    );
  });

  it("returns the version the database stored, not the one it was asked for", async () => {
    /**
     * The version is the cache key in a year-long `immutable` URL, and
     * `greatest(now(), updated_at + 1ms)` may move it forward past the current
     * millisecond. Reporting a locally generated timestamp would hand the
     * browser a URL that does not exist.
     */
    stored.current = new Date("2030-01-01T00:00:00.123Z");

    expect(await saveAvatar("user-1", BYTES, "image/webp")).toBe(stored.current.getTime());
    expect(onConflictDoUpdate).toHaveBeenCalled();
    expect(returning).toHaveBeenCalled();
  });

  it("says so rather than inventing a version when nothing comes back", async () => {
    returning.mockResolvedValueOnce([]);

    await expect(saveAvatar("user-1", BYTES, "image/webp")).rejects.toThrow(
      "Storing the avatar returned no row"
    );
  });

  it("keeps the upload when the measurement itself fails", async () => {
    /**
     * The avatar is already written by the time this runs. A diagnostic that
     * can break the thing it watches is worse than no diagnostic — so the
     * failure is logged and the version still comes back.
     */
    execute.mockRejectedValue(new Error("permission denied for pg_total_relation_size"));

    await expect(saveAvatar("user-1", BYTES, "image/webp")).resolves.toEqual(expect.any(Number));
    expect(logger.error).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("says nothing when the measurement comes back empty or unreadable", async () => {
    execute.mockResolvedValue([]);
    await saveAvatar("user-1", BYTES, "image/webp");

    execute.mockResolvedValue([{ bytes: "not-a-number", count: "1" }]);
    await saveAvatar("user-1", BYTES, "image/webp");

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
