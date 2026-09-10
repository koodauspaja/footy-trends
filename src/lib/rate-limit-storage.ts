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
 *
 * **What happens when Redis is down.** The count continues in memory rather
 * than being abandoned, so an outage degrades this to exactly that default
 * instead of removing the limit. See `consumeInMemory`.
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
 * The counters used while Redis is unreachable — one process's own, which is
 * exactly what better-auth does by default.
 *
 * **Why not simply allow the request.** Failing fully open would make an outage
 * remove the limit altogether, and that is a protection this change would then
 * have *taken away*: an in-process `Map` cannot have an outage, so before this
 * module there was nothing to lose. Falling back here means a Redis failure
 * degrades a shared limiter into a per-instance one — no worse than the state
 * this replaces, in any scenario.
 */
const fallback = new Map<string, { count: number; expiresAt: number }>();

/**
 * How many keys the fallback will hold before it sweeps expired ones.
 *
 * Windows here are ten to sixty seconds, so in a long outage almost everything
 * in the map is already dead. Sweeping on a threshold rather than on a timer
 * keeps this to one pass when it is actually needed, and stops a long outage
 * from growing the map without bound.
 */
const FALLBACK_SWEEP_AT = 10_000;

/** How many keys the fallback is holding. Exported for the sweep test only. */
export function fallbackSize(): number {
  return fallback.size;
}

function consumeInMemory(
  key: string,
  rule: { window: number; max: number }
): { allowed: boolean; retryAfter: number | null } {
  const now = Date.now();
  const entry = fallback.get(key);

  if (entry === undefined || now >= entry.expiresAt) {
    if (fallback.size >= FALLBACK_SWEEP_AT) {
      for (const [existing, held] of fallback) {
        if (now >= held.expiresAt) fallback.delete(existing);
      }
    }
    // A fixed window from the first request, matching the Lua script's guarded
    // EXPIRE rather than sliding forward with each one.
    fallback.set(key, { count: 1, expiresAt: now + rule.window * 1000 });
    return { allowed: true, retryAfter: null };
  }

  entry.count += 1;
  if (entry.count <= rule.max) return { allowed: true, retryAfter: null };
  return { allowed: false, retryAfter: Math.ceil((entry.expiresAt - now) / 1000) };
}

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
        const reply = await redis.eval(CONSUME, 1, key, rule.window);

        /**
         * Validated rather than cast. `as [number, number]` on an unexpected
         * reply left `count` as `undefined`, and `undefined <= rule.max` is
         * false — so a malformed answer would have **refused every request**
         * rather than falling back. A shape that is not two numbers is a
         * failure like any other.
         */
        if (!Array.isArray(reply) || typeof reply[0] !== "number" || typeof reply[1] !== "number") {
          throw new TypeError("Rate limit script returned an unexpected shape");
        }
        const [count, ttl] = reply;

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
         * **Degrade, do not disable.** Refusing every sign-in because a cache
         * is down would take authentication with it — the call `/api/health`
         * already makes, where Redis is non-fatal. But allowing everything
         * would mean this module had *removed* a protection that an in-process
         * `Map` was providing perfectly well, since a `Map` cannot have an
         * outage.
         *
         * So the count continues in memory: shared limiter becomes
         * per-instance limiter, which is what better-auth does by default and
         * what this repository ran until now.
         *
         * Logged at error rather than warn because the guarantee is weaker for
         * as long as this lasts, even though nothing is broken for a reader.
         */
        if (!degraded) {
          degraded = true;
          logger.error(
            { err: error },
            "Rate limit counters unreachable; counting in this instance's memory"
          );
        }
        return consumeInMemory(key, rule);
      }
    },
  };
}
