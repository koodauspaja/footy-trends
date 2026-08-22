import { beforeEach, describe, expect, it, vi } from "vitest";

const RedisMock = vi.fn();
vi.mock("ioredis", () => ({ default: RedisMock }));

type GlobalWithRedis = typeof globalThis & { redis: unknown };

describe("redis singleton", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    RedisMock.mockClear();
    (globalThis as GlobalWithRedis).redis = undefined;
  });

  it("creates a new client with the configured REDIS_URL and lazy-connect options", async () => {
    vi.stubEnv("REDIS_URL", "redis://example:6380");
    vi.stubEnv("NODE_ENV", "development");

    const { redis } = await import("@/lib/redis");

    expect(RedisMock).toHaveBeenCalledWith("redis://example:6380", {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    expect(redis).toBeInstanceOf(RedisMock);
  });

  it("falls back to localhost when REDIS_URL is not set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    // vi.unstubAllEnvs() restores REDIS_URL to whatever vitest.config.ts's
    // real .env load set it to (not necessarily unset) — delete it
    // explicitly so this test exercises the `??` fallback itself, not a
    // same-value coincidence.
    delete process.env.REDIS_URL;

    await import("@/lib/redis");

    expect(RedisMock).toHaveBeenCalledWith("redis://localhost:6379", expect.any(Object));
  });

  it("reuses the existing global client instead of creating a new one", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const existing = new RedisMock();
    RedisMock.mockClear();
    (globalThis as GlobalWithRedis).redis = existing;

    const { redis } = await import("@/lib/redis");

    expect(RedisMock).not.toHaveBeenCalled();
    expect(redis).toBe(existing);
  });

  it("caches the client on globalThis outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const { redis } = await import("@/lib/redis");

    expect((globalThis as GlobalWithRedis).redis).toBe(redis);
  });

  it("does not cache the client on globalThis in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await import("@/lib/redis");

    expect((globalThis as GlobalWithRedis).redis).toBeUndefined();
  });
});
