import { redis } from "./redis";

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);

  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  const fresh = await fetcher();
  await redis.setex(key, ttlSeconds, JSON.stringify(fresh));
  return fresh;
}

export async function invalidateCache(key: string): Promise<void> {
  await redis.del(key);
}
