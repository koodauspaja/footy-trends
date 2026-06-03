import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const setexMock = vi.fn();
const delMock = vi.fn();

vi.mock("@/lib/redis", () => ({
  redis: {
    get: getMock,
    setex: setexMock,
    del: delMock,
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

  it("throws when cached JSON is invalid", async () => {
    getMock.mockResolvedValue("not-json");

    const { getCached } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: 1 }));

    await expect(getCached("broken", 60, fetcher)).rejects.toThrow();

    expect(getMock).toHaveBeenCalledWith("broken");
    expect(fetcher).not.toHaveBeenCalled();
    expect(setexMock).not.toHaveBeenCalled();
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
  });
});
