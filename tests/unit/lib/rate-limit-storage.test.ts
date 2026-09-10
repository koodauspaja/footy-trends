import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Counting requests in Redis rather than in one instance's memory, from #318.
 *
 * `@/lib/redis` is mocked because these assert the decision made from what
 * Redis answers, not that Redis works — and the CI unit job has no services.
 */
const { evalMock } = vi.hoisted(() => ({ evalMock: vi.fn() }));
const { error: logError, info: logInfo } = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ redis: { eval: evalMock } }));
vi.mock("@/lib/logger", () => ({ logger: { error: logError, info: logInfo } }));

const RULE = { window: 10, max: 3 };

async function storage() {
  const { redisRateLimitStorage } = await import("@/lib/rate-limit-storage");
  return redisRateLimitStorage();
}

beforeEach(() => {
  vi.resetModules();
  evalMock.mockReset();
  logError.mockReset();
  logInfo.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("redisRateLimitStorage", () => {
  it("allows a request below the limit", async () => {
    evalMock.mockResolvedValue([1, 10]);

    expect(await (await storage()).consume("1.2.3.4|/sign-in", RULE)).toEqual({
      allowed: true,
      retryAfter: null,
    });
  });

  it("allows the request that reaches the limit exactly", async () => {
    // `count <= max`, not `<`: the third of three is the last allowed one, and
    // off-by-one here would give every client one fewer attempt than configured.
    evalMock.mockResolvedValue([3, 7]);

    expect(await (await storage()).consume("k", RULE)).toEqual({
      allowed: true,
      retryAfter: null,
    });
  });

  it("refuses the request past the limit, reporting the time actually left", async () => {
    // The TTL, not the whole window: better-auth's own secondary-storage path
    // reports `rule.window`, which over-states the wait for anyone refused late.
    evalMock.mockResolvedValue([4, 2]);

    expect(await (await storage()).consume("k", RULE)).toEqual({
      allowed: false,
      retryAfter: 2,
    });
  });

  it.each([
    ["no expiry was set", -1],
    ["the key expired between the increment and the read", -2],
  ])("falls back to the window when %s", async (_case, ttl) => {
    evalMock.mockResolvedValue([4, ttl]);

    expect(await (await storage()).consume("k", RULE)).toEqual({
      allowed: false,
      retryAfter: 10,
    });
  });

  it("counts once per request, setting the expiry only when the key is created", async () => {
    evalMock.mockResolvedValue([1, 10]);
    await (await storage()).consume("1.2.3.4|/sign-in", RULE);

    const [script, keyCount, key, window] = evalMock.mock.calls[0] as [
      string,
      number,
      string,
      number,
    ];

    expect(keyCount).toBe(1);
    expect(key).toBe("1.2.3.4|/sign-in");
    expect(window).toBe(10);
    // The window must run from the first request rather than being extended by
    // later ones, which is what `count == 1` guards.
    expect(script).toContain("INCR");
    expect(script).toContain("count == 1");
    expect(script).toContain("EXPIRE");
  });

  it("allows the request when the counters are unreachable, and says so", async () => {
    // Failing open is deliberate: refusing every sign-in because a cache is down
    // would take authentication with it. Logged at error, because the
    // protection is gone for as long as it lasts.
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await (await storage()).consume("k", RULE)).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("logs an outage once rather than once per request", async () => {
    // Rate limiting runs on every auth request; a line each would flood the logs
    // for as long as Redis was down.
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    await store.consume("k", RULE);
    await store.consume("k", RULE);
    await store.consume("k", RULE);

    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("says when the counters come back, and can report a later outage", async () => {
    evalMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const store = await storage();
    await store.consume("k", RULE);

    evalMock.mockResolvedValueOnce([1, 10]);
    await store.consume("k", RULE);
    expect(logInfo).toHaveBeenCalledTimes(1);

    // The flag has to reset, or a second outage would pass silently.
    evalMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await store.consume("k", RULE);
    expect(logError).toHaveBeenCalledTimes(2);
  });

  it("does not announce a recovery that never followed an outage", async () => {
    evalMock.mockResolvedValue([1, 10]);
    const store = await storage();

    await store.consume("k", RULE);
    await store.consume("k", RULE);

    expect(logInfo).not.toHaveBeenCalled();
  });
});
