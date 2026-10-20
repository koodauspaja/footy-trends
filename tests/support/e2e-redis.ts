import Redis from "ioredis";
import { e2eAppPort, e2eRedisPort } from "../../scripts/e2e-target";
import { parseDatabaseUrl } from "../../src/lib/test-database-name";
import { standInRedis } from "./taso-stub";

/**
 * The database a live e2e run uses on the Redis server `REDIS_URL` names, so it
 * never reads or writes development's.
 *
 * decisions/615-e2e-own-redis.md
 */
export const LIVE_RUN_DATABASE = 1;

/**
 * `redis://localhost:6379` → `redis://localhost:6379/1`: `REDIS_URL`'s server,
 * the live run's database. Refuses a `REDIS_URL` naming that database itself.
 *
 * decisions/615-e2e-own-redis.md
 */
export function liveRunRedisUrl(redisUrl: string | undefined): string {
  const url = parseDatabaseUrl((redisUrl ?? "").trim() || "redis://localhost:6379", "REDIS_URL");
  const named = url.searchParams.get("db") ?? url.pathname.replace(/^\//, "");
  if (Number(named) === LIVE_RUN_DATABASE) {
    throw new Error(
      `REDIS_URL names database ${LIVE_RUN_DATABASE}, which live e2e runs use: ${url.host}`
    );
  }
  url.searchParams.delete("db");
  url.pathname = `/${LIVE_RUN_DATABASE}`;
  return url.toString();
}

/**
 * The Redis an e2e run uses: the stand-in's container with `E2E_TASO_STUB=1`,
 * the live run's database otherwise. Derived, never read from a variable the
 * run sets, so nothing can point a spec at development's.
 *
 * decisions/615-e2e-own-redis.md
 */
export function e2eRedisUrl(env: Record<string, string | undefined>): string {
  return env.E2E_TASO_STUB === "1"
    ? standInRedis(e2eRedisPort(env), e2eAppPort(env)).url
    : liveRunRedisUrl(env.REDIS_URL);
}

/**
 * Drops entries from the run's Redis: each a key, or a pattern with `*`.
 *
 * decisions/615-e2e-own-redis.md
 */
export async function dropCached(...entries: string[]): Promise<void> {
  const redis = new Redis(e2eRedisUrl(process.env));
  try {
    const keys = (
      await Promise.all(entries.map((entry) => (entry.includes("*") ? redis.keys(entry) : [entry])))
    ).flat();
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    await redis.quit();
  }
}
