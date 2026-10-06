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
 * Drops a cached entry, reporting whether it happened. Never throws; the
 * forced refresh stops on a `false`.
 *
 * decisions/029-forced-season-refresh.md
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
