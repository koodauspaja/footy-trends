import { logger } from "./logger";
import type { MatchSource } from "./match-source";
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
 * `getCachedUnlessDegraded` for an entry computed from a competition-season's
 * stored rows: its key carries the generation read before the rows are, so an
 * entry computed before a forced refresh is stored where nothing reads it.
 * Without a generation the entry is computed and not stored.
 *
 * decisions/691-computed-cache-generations.md
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
    return (await fetcher()).value;
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
