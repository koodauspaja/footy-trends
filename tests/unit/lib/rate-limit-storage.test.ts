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
  // Unconditionally, not at the end of each test body: a failed assertion left
  // fake timers installed for every later test in the file, turning one failure
  // into a cascade of unrelated ones.
  vi.useRealTimers();
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

  it("asks for a second when under half of one remains", async () => {
    // Redis `TTL` answers in whole seconds rounded to nearest, so a key with
    // 400 ms left reports 0. Passing that on invites an immediate retry that is
    // refused again, and the in-memory path already rounds up to 1.
    evalMock.mockResolvedValue([4, 0]);

    expect(await (await storage()).consume("k", RULE)).toEqual({
      allowed: false,
      retryAfter: 1,
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

  it("keeps serving when the counters are unreachable, and says so", async () => {
    // Refusing every sign-in because a cache is down would take authentication
    // with it. Logged at error, because the guarantee is weaker while it lasts.
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await (await storage()).consume("k", RULE)).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("still enforces the limit while Redis is unreachable", async () => {
    // The point of the fallback. Allowing everything would mean this module had
    // *removed* a protection, because the in-process Map it replaced cannot
    // have an outage.
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push((await store.consume("k", RULE)).allowed);

    expect(outcomes).toEqual([true, true, true, false, false]);
  });

  it("counts each client separately while unreachable", async () => {
    // A per-instance limiter is still a per-client one; sharing a bucket here
    // would reintroduce the very bug #309 fixed.
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    for (let i = 0; i < 4; i++) await store.consume("first", RULE);

    expect((await store.consume("second", RULE)).allowed).toBe(true);
  });

  it("reports the time left in the in-memory window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    for (let i = 0; i < 3; i++) await store.consume("k", RULE);
    vi.setSystemTime(new Date("2026-01-01T00:00:04Z"));

    expect(await store.consume("k", RULE)).toEqual({ allowed: false, retryAfter: 6 });
  });

  it("opens a fresh in-memory window once the old one elapses", async () => {
    // A fixed window from the first request, like the Lua script's guarded
    // EXPIRE — not one that slides forward with every rejected attempt.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    for (let i = 0; i < 4; i++) await store.consume("k", RULE);
    vi.setSystemTime(new Date("2026-01-01T00:00:11Z"));

    expect((await store.consume("k", RULE)).allowed).toBe(true);
  });

  it("sweeps expired entries so a long outage does not grow without bound", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    for (let i = 0; i < 10_000; i++) await store.consume(`client-${i}`, RULE);
    // Every one of those windows has closed; the next new key triggers the sweep.
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    await store.consume("after-the-sweep", RULE);

    const { fallbackSize } = await import("@/lib/rate-limit-storage");
    expect(fallbackSize()).toBe(1);
  });

  it("keeps entries whose window is still open when it sweeps", async () => {
    // The sweep drops what has expired, not everything it walks past. Clearing
    // indiscriminately would hand every client a fresh allowance at exactly the
    // moment the map is busiest.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    for (let i = 0; i < 10_000; i++) await store.consume(`client-${i}`, RULE);
    // Half a window later: the sweep runs, and every entry is still live.
    vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
    await store.consume("one-more", RULE);

    const { fallbackSize } = await import("@/lib/rate-limit-storage");
    expect(fallbackSize()).toBe(10_001);
  });

  it("refuses to trust a reply that is not two numbers", async () => {
    // `as [number, number]` on a malformed reply left `count` undefined, and
    // `undefined <= max` is false — so it would have refused every request
    // instead of falling back.
    evalMock.mockResolvedValue(["not", "numbers"]);

    expect((await (await storage()).consume("k", RULE)).allowed).toBe(true);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("logs an outage once rather than once per request", async () => {
    // Rate limiting runs on every auth request; a line each would flood the logs
    // for as long as Redis was down.
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    await store.consume("a", RULE);
    await store.consume("b", RULE);
    await store.consume("c", RULE);

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

  it("does not hand out a second allowance when Redis comes back", async () => {
    // The client spent its window in memory during the outage. Redis's key
    // expired or was never written, so INCR restarts it at 1 inside a window
    // already used up — both allowances would be spendable back to back.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    for (let i = 0; i < 4; i++) await store.consume("k", RULE);

    // Redis is back, and answers as though this key were new.
    evalMock.mockReset();
    evalMock.mockResolvedValue([1, 10]);
    vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));

    expect((await store.consume("k", RULE)).allowed).toBe(false);
  });

  it("lets Redis take over once the in-memory window closes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    for (let i = 0; i < 4; i++) await store.consume("k", RULE);

    evalMock.mockReset();
    evalMock.mockResolvedValue([1, 10]);
    vi.setSystemTime(new Date("2026-01-01T00:00:11Z"));

    expect((await store.consume("k", RULE)).allowed).toBe(true);

    const { fallbackSize } = await import("@/lib/rate-limit-storage");
    expect(fallbackSize()).toBe(0);
  });

  it("still refuses on Redis's own count during a recovery window", async () => {
    // The stricter of the two answers wins, in both directions.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    evalMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await storage();

    await store.consume("k", RULE);

    evalMock.mockReset();
    evalMock.mockResolvedValue([9, 4]);
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));

    expect(await store.consume("k", RULE)).toEqual({ allowed: false, retryAfter: 4 });
  });

  it("does not announce a recovery that never followed an outage", async () => {
    evalMock.mockResolvedValue([1, 10]);
    const store = await storage();

    await store.consume("k", RULE);
    await store.consume("k", RULE);

    expect(logInfo).not.toHaveBeenCalled();
  });
});
