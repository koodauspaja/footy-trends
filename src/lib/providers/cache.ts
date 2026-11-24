import type { MatchSource } from "../matches/match-source";
import { logger } from "../platform/logger";
import { redis } from "../platform/redis";

/**
 * What a fetcher answers when its value may be a fallback built from a failure.
 *
 * decisions/534-taso-season-fallback-cache.md
 */
export type Fetched<T> = { value: T; degraded: boolean };

/**
 * The fetch already running for a key in this process, if any.
 *
 * decisions/880-bounded-provider-requests.md
 */
const inFlight = new Map<string, Promise<Fetched<unknown>>>();

/**
 * One fetch for every caller that misses the same key at once: the first starts
 * it, the rest await it, and it is forgotten once it settles.
 *
 * decisions/880-bounded-provider-requests.md
 */
function sharedFetch<T>(key: string, fetcher: () => Promise<Fetched<T>>): Promise<Fetched<T>> {
  const running = inFlight.get(key);
  if (running !== undefined) return running as Promise<Fetched<T>>;
  const started = fetcher();
  inFlight.set(key, started);
  const forget = () => {
    inFlight.delete(key);
  };
  started.then(forget, forget);
  return started;
}

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
 * decisions/880-bounded-provider-requests.md
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

  // The write is part of what is shared, so a miss just after the fetch still joins it.
  const { value } = await sharedFetch(key, async () => {
    const fetched = await fetcher();
    if (fetched.degraded) return fetched;
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(fetched.value));
    } catch (error) {
      logger.error({ err: error, key }, "Cache write failed");
    }
    return fetched;
  });
  return value;
}

/**
 * The competition-season an entry is computed from, whose generation its key
 * carries.
 *
 * decisions/691-computed-cache-generations.md
 */
export type ComputedFrom = { kind: MatchSource["kind"]; code: string; seasonId: number };

/**
 * The key of a competition-season's generation, which a forced refresh moves
 * on once its write has committed.
 *
 * decisions/691-computed-cache-generations.md
 */
export function generationKey({ kind, code, seasonId }: ComputedFrom): string {
  return `generation:${kind}:${code}:${seasonId}`;
}

/**
 * `getCachedUnlessDegraded` for an entry computed from a competition-season's stored rows: its key
 * carries the generation read before the rows, so an entry computed before a forced refresh is
 * stored where nothing reads it. Without a generation it is computed and not stored.
 *
 * decisions/691-computed-cache-generations.md
 * decisions/880-bounded-provider-requests.md
 */
export async function getComputedUnlessDegraded<T>(
  from: ComputedFrom,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<Fetched<T>>
): Promise<T> {
  let generation: string | null;
  try {
    generation = await redis.get(generationKey(from));
  } catch (error) {
    logger.error({ err: error, key: generationKey(from) }, "Cache read failed");
    return (await sharedFetch(key, fetcher)).value;
  }
  return getCachedUnlessDegraded(`${key}:g${generation ?? 0}`, ttlSeconds, fetcher);
}

/**
 * Moves a competition-season's computed entries to a new generation, reporting
 * whether it happened. Never throws.
 *
 * decisions/691-computed-cache-generations.md
 */
export async function nextGeneration(from: ComputedFrom): Promise<boolean> {
  try {
    await redis.incr(generationKey(from));
    return true;
  } catch (error) {
    logger.error({ err: error, key: generationKey(from) }, "Cache write failed");
    return false;
  }
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
