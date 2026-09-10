import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

/**
 * Where better-auth counts requests for rate limiting, from #318.
 *
 * **Why not `secondaryStorage`.** That is the option better-auth documents for
 * this, and it does more than it says: with a secondary storage configured,
 * *sessions* move into it too — "reads are always done from the secondary
 * storage", and rows are deleted from the database. Sign-in would then depend on
 * Redis being up. `rateLimit.customStorage` is consulted before any of that
 * (`getRateLimitStorage` returns it on the first line), so only the counters
 * move and sessions stay in Postgres where #023 put them.
 *
 * **Why not the default.** better-auth falls back to an in-process `Map`, which
 * resets on every deploy and, more seriously, would become one limiter per
 * instance the moment the service ran two — with nothing reporting that the
 * limit had quietly multiplied.
 */

/**
 * One request counted, atomically, in a single round trip.
 *
 * `INCR` creates the key at 1, and the expiry is set only on that first call —
 * so the window runs a fixed `window` seconds from the first request rather than
 * being extended by later ones. That is better-auth's own documented semantics
 * for `increment`, and it is why `EXPIRE` is guarded by `count == 1` instead of
 * being set every time.
 *
 * The `TTL` comes back in the same script so `retryAfter` can be the time
 * actually remaining. better-auth's own secondary-storage path reports the whole
 * window instead, which over-states the wait for anyone refused late in one.
 */
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('TTL', KEYS[1])}
`;

/**
 * Whether the last attempt failed, so an outage logs once rather than once per
 * request. Rate limiting runs on every auth request; a Redis outage would
 * otherwise write a line per request to Axiom for as long as it lasted.
 */
let degraded = false;

/**
 * better-auth's `rateLimit.customStorage` shape, declared here rather than
 * imported.
 *
 * The interface lives in `@better-auth/core`, which is a **transitive**
 * dependency — not in `package.json`, and free to move or vanish on a
 * better-auth bump. Passing this object to `betterAuth()` in `auth.ts` checks it
 * structurally against the real type, so a changed contract still fails the
 * build, without depending on a package this project never declared.
 */
type RateLimitStorage = {
  consume: (
    key: string,
    rule: { window: number; max: number }
  ) => Promise<{ allowed: boolean; retryAfter: number | null }>;
};

export function redisRateLimitStorage(): RateLimitStorage {
  return {
    async consume(key, rule) {
      try {
        const [count, ttl] = (await redis.eval(CONSUME, 1, key, rule.window)) as [number, number];

        if (degraded) {
          degraded = false;
          logger.info("Rate limit counters are reachable again");
        }

        if (count <= rule.max) return { allowed: true, retryAfter: null };

        // A TTL of -1 means the key somehow has no expiry and -2 that it went
        // between the INCR and the TTL; the configured window is the honest
        // answer for both, rather than a negative retryAfter.
        return { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
      } catch (error) {
        /**
         * **Failing open is deliberate.** With the counters unreachable the
         * choice is between refusing every sign-in and enforcing no limit, and
         * an outage of the cache must not take authentication down with it —
         * the same call `/api/health` already makes, where Redis is non-fatal
         * because the app serves fine without its cache.
         *
         * It is logged at error rather than warn because the protection is gone
         * while this is true, which is worth waking up to even though nothing
         * is broken for a reader.
         */
        if (!degraded) {
          degraded = true;
          logger.error({ err: error }, "Rate limit counters unreachable; requests are not limited");
        }
        return { allowed: true, retryAfter: null };
      }
    },
  };
}
