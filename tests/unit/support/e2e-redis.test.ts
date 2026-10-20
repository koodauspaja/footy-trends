import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The e2e run's own Redis: which one a run uses, the refusal of development's,
 * and dropping entries from it.
 *
 * decisions/615-e2e-own-redis.md
 */

const { connected, keys, del, quit } = vi.hoisted(() => ({
  connected: vi.fn<(url: string) => void>(),
  keys: vi.fn<(pattern: string) => Promise<string[]>>(),
  del: vi.fn<(...keys: string[]) => Promise<number>>(),
  quit: vi.fn<() => Promise<string>>(),
}));

vi.mock("ioredis", () => ({
  default: class {
    constructor(url: string) {
      connected(url);
    }
    keys = keys;
    del = del;
    quit = quit;
  },
}));

import {
  dropCached,
  e2eRedisUrl,
  LIVE_RUN_DATABASE,
  liveRunRedisUrl,
} from "../../support/e2e-redis";

describe("liveRunRedisUrl", () => {
  it("is database 1 on the server REDIS_URL names, localhost when it names none", () => {
    expect(LIVE_RUN_DATABASE).toBe(1);
    expect(liveRunRedisUrl("redis://localhost:6379")).toBe("redis://localhost:6379/1");
    expect(liveRunRedisUrl("redis://localhost:6379/0")).toBe("redis://localhost:6379/1");
    expect(liveRunRedisUrl(undefined)).toBe("redis://localhost:6379/1");
    expect(liveRunRedisUrl("  ")).toBe("redis://localhost:6379/1");
  });

  it("keeps the credentials and options, and drops a db option", () => {
    expect(liveRunRedisUrl("redis://:secret@host:6380/2?keepAlive=off")).toBe(
      "redis://:secret@host:6380/1?keepAlive=off"
    );
    expect(liveRunRedisUrl("redis://localhost:6379?db=3")).toBe("redis://localhost:6379/1");
  });

  it("refuses a REDIS_URL that names database 1 itself, by path or option", () => {
    expect(() => liveRunRedisUrl("redis://localhost:6379/1")).toThrow(
      "REDIS_URL names database 1, which live e2e runs use: localhost:6379"
    );
    expect(() => liveRunRedisUrl("redis://localhost:6379?db=1")).toThrow(/names database 1/);
    expect(() => liveRunRedisUrl("redis://localhost:6379/01")).toThrow(/names database 1/);
    expect(() => liveRunRedisUrl("redis://localhost:6379?db=01")).toThrow(/names database 1/);
  });

  it("names REDIS_URL, never its value, when it is not a URL", () => {
    expect(() => liveRunRedisUrl("secret not a url")).toThrow("REDIS_URL is not a valid URL.");
  });
});

describe("e2eRedisUrl", () => {
  it("is the stand-in's container with E2E_TASO_STUB=1", () => {
    expect(e2eRedisUrl({ E2E_TASO_STUB: "1", REDIS_URL: "redis://localhost:6379" })).toBe(
      "redis://127.0.0.1:6380"
    );
    expect(e2eRedisUrl({ E2E_TASO_STUB: "1", E2E_REDIS_PORT: "6390" })).toBe(
      "redis://127.0.0.1:6390"
    );
  });

  it("is the live run's database otherwise", () => {
    expect(e2eRedisUrl({ REDIS_URL: "redis://localhost:6379" })).toBe("redis://localhost:6379/1");
  });
});

describe("dropCached", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("E2E_TASO_STUB", "");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    connected.mockReset();
    keys.mockReset().mockResolvedValue(["quality:v3:taso:backtest", "quality:v3:taso:live"]);
    del.mockReset().mockResolvedValue(1);
    quit.mockReset().mockResolvedValue("OK");
  });

  it("deletes the keys named and those a pattern matches, from the run's Redis", async () => {
    await dropCached("elo:v1:taso", "quality:v3:taso:*");

    expect(connected).toHaveBeenCalledWith("redis://localhost:6379/1");
    expect(keys).toHaveBeenCalledWith("quality:v3:taso:*");
    expect(keys).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(
      "elo:v1:taso",
      "quality:v3:taso:backtest",
      "quality:v3:taso:live"
    );
    expect(quit).toHaveBeenCalled();
  });

  it("deletes nothing when a pattern matches nothing", async () => {
    keys.mockResolvedValue([]);
    await dropCached("forecast:v4:football-data:*");

    expect(del).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalled();
  });

  it("refuses a REDIS_URL on the live run's database, and connects to nothing", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379/1");

    await expect(dropCached("elo:v1:taso")).rejects.toThrow(/names database 1/);
    expect(connected).not.toHaveBeenCalled();
  });

  it("disconnects when a delete fails", async () => {
    del.mockRejectedValue(new Error("connection lost"));

    await expect(dropCached("elo:v1:taso")).rejects.toThrow("connection lost");
    expect(quit).toHaveBeenCalled();
  });
});
