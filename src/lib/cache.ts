import { logger } from "./logger";
import { redis } from "./redis";

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  let cached: string | null = null;
  try {
    cached = await redis.get(key);
  } catch (error) {
    logger.error({ err: error, key }, "Cache read failed");
  }

  if (cached !== null) {
    try {
      return JSON.parse(cached) as T;
    } catch (error) {
      logger.error({ err: error, key }, "Cache read failed: invalid JSON");
    }
  }

  const fresh = await fetcher();

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(fresh));
  } catch (error) {
    logger.error({ err: error, key }, "Cache write failed");
  }

  return fresh;
}

/**
 * Drops a cached entry, reporting whether it actually happened.
 *
 * The boolean matters to exactly one caller, and for a sharp reason: the forced
 * refresh in `force-refresh.ts` clears a provider's entry *in order to* reach
 * the provider. If the clear silently failed, the refetch would come back out
 * of Redis and an admin would be shown — and would apply — a diff built from
 * the stale data they were trying to correct. So a `false` stops that run
 * rather than being swallowed. See specs/029-forced-season-refresh.md.
 *
 * Still never throws: a failure to invalidate is not a reason to fail a request
 * that was only trying to be helpful.
 */
export async function invalidateCache(key: string): Promise<boolean> {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error({ err: error, key }, "Cache invalidate failed");
    return false;
  }
}
