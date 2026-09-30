/**
 * Spacing provider requests to a rate. Shared by the backfill and the hourly
 * predictions run (specs/052), which spend the same football-data.org key.
 */

/**
 * 90% of football-data.org's documented 10 a minute (docs/setup/007). The key
 * is shared by staging, production and every reader's page view, so a batch
 * job never takes the whole limit.
 */
export const FOOTBALL_DATA_PER_MINUTE = 9;

/**
 * TASO publishes no limit, so there is no maximum to take a percentage of;
 * one a second is well under what the domestic pages' views already ask of it.
 */
export const TASO_PER_MINUTE = 60;

/**
 * Milliseconds to wait before the next request so that requests are spaced at
 * least `minIntervalMs` apart. Zero when enough time has already passed —
 * database writes between requests are not free, and charging for time already
 * spent would make a 344-request run considerably longer than it needs to be.
 */
export function delayBefore(
  lastRequestAt: number | null,
  now: number,
  minIntervalMs: number
): number {
  if (lastRequestAt === null) return 0;
  return Math.max(0, minIntervalMs - (now - lastRequestAt));
}

/** Requests per minute -> the gap to leave between them. */
export function intervalForRatePerMinute(perMinute: number): number {
  if (perMinute <= 0) throw new Error(`Rate must be positive, got ${perMinute}`);
  return Math.ceil(60_000 / perMinute);
}

export type Paced = <T>(work: () => Promise<T>) => Promise<T>;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Spaces one provider's requests, independently of the other's. The clock and
 * the sleep are parameters so a test can run it without waiting.
 */
export function createPacer(
  perMinute: number,
  { now = Date.now, sleep = defaultSleep }: { now?: () => number; sleep?: typeof defaultSleep } = {}
): Paced {
  const interval = intervalForRatePerMinute(perMinute);
  let lastAt: number | null = null;
  return async function paced<T>(work: () => Promise<T>): Promise<T> {
    const wait = delayBefore(lastAt, now(), interval);
    if (wait > 0) await sleep(wait);
    lastAt = now();
    return work();
  };
}
