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
    return JSON.parse(cached) as T;
  }

  const fresh = await fetcher();

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(fresh));
  } catch (error) {
    logger.error({ err: error, key }, "Cache write failed");
  }

  return fresh;
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    logger.error({ err: error, key }, "Cache invalidate failed");
  }
}
