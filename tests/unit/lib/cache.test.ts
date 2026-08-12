import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const setexMock = vi.fn();
const delMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock("@/lib/redis", () => ({
  redis: {
    get: getMock,
    setex: setexMock,
    del: delMock,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

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

  it("invalidates cache by deleting the key", async () => {
    delMock.mockResolvedValue(1);

    const { invalidateCache } = await import("@/lib/cache");
    await invalidateCache("baz");

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

  it("does not throw and logs when cache invalidation fails", async () => {
    const delError = new Error("redis unavailable");
    delMock.mockRejectedValue(delError);

    const { invalidateCache } = await import("@/lib/cache");

    await expect(invalidateCache("baz")).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: delError, key: "baz" },
      "Cache invalidate failed"
    );
  });
});
