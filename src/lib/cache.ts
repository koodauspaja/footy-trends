import { logger } from "./logger";
import { redis } from "./redis";

/**
 * What a fetcher answers when its value may be a fallback built from a failure.
 *
 * decisions/534-taso-season-fallback-cache.md
 */
export type Fetched<T> = { value: T; degraded: boolean };

export function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  return getCachedUnlessDegraded(key, ttlSeconds, async () => ({
    value: await fetcher(),
    degraded: false,
  }));
}

/**
 * `getCached` for a fetcher that can fall back: a degraded value is returned
 * and not stored, so the next call asks again.
 *
 * decisions/534-taso-season-fallback-cache.md
 */
export async function getCachedUnlessDegraded<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<Fetched<T>>
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

  const { value, degraded } = await fetcher();
  if (degraded) return value;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error({ err: error, key }, "Cache write failed");
  }

  return value;
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
