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
    expect(fetcher).not.toHaveBeenCalled();
    expect(setexMock).not.toHaveBeenCalled();
  });

  it("fetches and stores value when cache is missing", async () => {
    getMock.mockResolvedValue(null);

    const { getCached } = await import("@/lib/cache");
    const fetcher = vi.fn(async () => ({ value: 7 }));

    const result = await getCached("bar", 60, fetcher);

    expect(result).toEqual({ value: 7 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(setexMock).toHaveBeenCalledWith("bar", 60, '{"value":7}');
  });

  it("invalidates cache by deleting the key", async () => {
    delMock.mockResolvedValue(1);

    const { invalidateCache } = await import("@/lib/cache");
    await invalidateCache("baz");

    expect(delMock).toHaveBeenCalledWith("baz");
  });
});
