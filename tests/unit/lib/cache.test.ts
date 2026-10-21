import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * The cache helpers, and the generations a forced refresh moves the computed
 * entries on by.
 *
 * decisions/029-forced-season-refresh.md
 * decisions/691-computed-cache-generations.md
 */

const getMock = vi.fn();
const setexMock = vi.fn();
const delMock = vi.fn();
const incrMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock("@/lib/redis", () => ({
  redis: {
    get: getMock,
    setex: setexMock,
    del: delMock,
    incr: incrMock,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

warmModules(() => import("@/lib/cache"));

describe("cache helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached value when present", async () => {
    getMock.mockResolvedValue('{"value":42}');

    const { getCached } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: 999 }));

    const result = await getCached("foo", 30, fetcher);

    expect(result).toEqual({ value: 42 });
    expect(getMock).toHaveBeenCalledWith("foo");
    expect(fetcher).not.toHaveBeenCalled();
    expect(setexMock).not.toHaveBeenCalled();
  });

  it("returns falsy cached values without calling fetcher", async () => {
    getMock.mockResolvedValue("0");

    const { getCached } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => 999);

    const result = await getCached("falsy", 30, fetcher);

    expect(result).toBe(0);
    expect(getMock).toHaveBeenCalledWith("falsy");
    expect(fetcher).not.toHaveBeenCalled();
    expect(setexMock).not.toHaveBeenCalled();
  });

  it("fetches and stores value when cache is missing", async () => {
    getMock.mockResolvedValue(null);

    const { getCached } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: 7 }));

    const result = await getCached("bar", 60, fetcher);

    expect(result).toEqual({ value: 7 });
    expect(getMock).toHaveBeenCalledWith("bar");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(setexMock).toHaveBeenCalledWith("bar", 60, '{"value":7}');
  });

  it("falls back to the fetcher and logs when cached JSON is invalid", async () => {
    getMock.mockResolvedValue("not-json");
    setexMock.mockResolvedValue("OK");

    const { getCached } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: 1 }));

    const result = await getCached("broken", 60, fetcher);

    expect(result).toEqual({ value: 1 });
    expect(getMock).toHaveBeenCalledWith("broken");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: expect.any(SyntaxError), key: "broken" },
      "Cache read failed: invalid JSON"
    );
  });

  it("propagates fetcher errors and does not cache on failure", async () => {
    getMock.mockResolvedValue(null);

    const { getCached } = await import("@/lib/cache");
    const fetcherError = new Error("fetch failed");
    const fetcher = vi.fn(async () => {
      throw fetcherError;
    });

    await expect(getCached("fetch-fail", 60, fetcher)).rejects.toThrow("fetch failed");

    expect(getMock).toHaveBeenCalledWith("fetch-fail");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(setexMock).not.toHaveBeenCalled();
  });

  it("returns a degraded value without storing it", async () => {
    getMock.mockResolvedValue(null);

    const { getCachedUnlessDegraded } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: { season: 2025 }, degraded: true }));

    await expect(getCachedUnlessDegraded("fallback", 60, fetcher)).resolves.toEqual({
      season: 2025,
    });
    expect(setexMock).not.toHaveBeenCalled();
  });

  it("stores the value alone when it is not degraded", async () => {
    getMock.mockResolvedValue(null);

    const { getCachedUnlessDegraded } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: { season: 2026 }, degraded: false }));

    await expect(getCachedUnlessDegraded("answered", 60, fetcher)).resolves.toEqual({
      season: 2026,
    });
    expect(setexMock).toHaveBeenCalledWith("answered", 60, '{"season":2026}');
  });

  it("answers from the cache without asking the fetcher whether it is degraded", async () => {
    getMock.mockResolvedValue('{"season":2026}');

    const { getCachedUnlessDegraded } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: { season: 2025 }, degraded: true }));

    await expect(getCachedUnlessDegraded("answered", 60, fetcher)).resolves.toEqual({
      season: 2026,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("invalidates cache by deleting the key", async () => {
    delMock.mockResolvedValue(1);

    const { invalidateCache } = await import("@/lib/cache");

    await expect(invalidateCache("baz")).resolves.toBe(true);
    expect(delMock).toHaveBeenCalledWith("baz");
    expect(delMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("falls back to the fetcher and logs when the cache read fails", async () => {
    const readError = new Error("redis unavailable");
    getMock.mockRejectedValue(readError);
    setexMock.mockResolvedValue("OK");

    const { getCached } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: 5 }));

    const result = await getCached("read-fail", 30, fetcher);

    expect(result).toEqual({ value: 5 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: readError, key: "read-fail" },
      "Cache read failed"
    );
  });

  it("still returns the fetched value and logs when the cache write fails", async () => {
    getMock.mockResolvedValue(null);
    const writeError = new Error("redis unavailable");
    setexMock.mockRejectedValue(writeError);

    const { getCached } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: 9 }));

    const result = await getCached("write-fail", 30, fetcher);

    expect(result).toEqual({ value: 9 });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: writeError, key: "write-fail" },
      "Cache write failed"
    );
  });

  it("reports failure and logs rather than throwing when cache invalidation fails", async () => {
    const delError = new Error("redis unavailable");
    delMock.mockRejectedValue(delError);

    const { invalidateCache } = await import("@/lib/cache");

    // False, not undefined: `force-refresh.ts` refuses to run on this, rather
    // than fetching a season out of the cache it was trying to bypass.
    await expect(invalidateCache("baz")).resolves.toBe(false);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: delError, key: "baz" },
      "Cache invalidate failed"
    );
  });
});

describe("generations", () => {
  const VL = { kind: "taso", code: "VL", seasonId: 2026 } as const;

  // Redis as a map, so a read, a write and a generation's move interleave as they would.
  function inMemory() {
    const store = new Map<string, string>();
    getMock.mockImplementation(async (key: string) => store.get(key) ?? null);
    setexMock.mockImplementation(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
    });
    incrMock.mockImplementation(async (key: string) => {
      store.set(key, String(Number(store.get(key) ?? 0) + 1));
    });
    return store;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockReset();
    setexMock.mockReset();
    incrMock.mockReset();
  });

  it("keys a computed entry by its season's generation, 0 before any refresh", async () => {
    const store = inMemory();
    const { getComputedUnlessDegraded, generationKey } = await import("@/lib/cache");

    await getComputedUnlessDegraded(VL, "forecast:VL", 60, async () => ({
      value: 1,
      degraded: false,
    }));
    store.set(generationKey(VL), "3");
    await getComputedUnlessDegraded(VL, "forecast:VL", 60, async () => ({
      value: 2,
      degraded: false,
    }));

    expect(generationKey(VL)).toBe("generation:taso:VL:2026");
    expect(setexMock.mock.calls.map(([key]) => key)).toEqual(["forecast:VL:g0", "forecast:VL:g3"]);
  });

  it("never serves an entry computed from rows read before a forced refresh", async () => {
    inMemory();
    const { getComputedUnlessDegraded, nextGeneration } = await import("@/lib/cache");
    let finish: (value: string) => void = () => undefined;
    let started: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });

    // A miss that has read the old rows, still computing.
    const before = getComputedUnlessDegraded(VL, "forecast:VL", 60, () => {
      started();
      return new Promise<{ value: string; degraded: boolean }>((resolve) => {
        finish = (value) => resolve({ value, degraded: false });
      });
    });
    await reading;
    // The refresh commits its write and moves the season on; the old figures land after.
    await nextGeneration(VL);
    finish("old");
    await before;

    const after = await getComputedUnlessDegraded(VL, "forecast:VL", 60, async () => ({
      value: "new",
      degraded: false,
    }));
    expect(after).toBe("new");
  });

  it("computes without storing when the generation cannot be read, and logs it", async () => {
    getMock.mockRejectedValue(new Error("redis unavailable"));
    const { getComputedUnlessDegraded } = await import("@/lib/cache");

    await expect(
      getComputedUnlessDegraded(VL, "forecast:VL", 60, async () => ({ value: 7, degraded: false }))
    ).resolves.toBe(7);
    expect(setexMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "generation:taso:VL:2026" }),
      "Cache read failed"
    );
  });

  it("moves a season to its next generation, and says when it could not", async () => {
    const { nextGeneration } = await import("@/lib/cache");
    incrMock.mockResolvedValueOnce(1);

    await expect(nextGeneration(VL)).resolves.toBe(true);
    expect(incrMock).toHaveBeenCalledWith("generation:taso:VL:2026");

    incrMock.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(nextGeneration(VL)).resolves.toBe(false);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "generation:taso:VL:2026" }),
      "Cache write failed"
    );
  });
});
