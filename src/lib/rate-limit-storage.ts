import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

/**
 * Where better-auth counts requests for rate limiting: in Redis, and in this
 * process's memory while Redis is unreachable.
 *
 * decisions/318-rate-limit-storage.md
 */

/**
 * One request counted, atomically, in one round trip. The expiry is set on the
 * first call only, and the `TTL` comes back with the count.
 *
 * decisions/318-rate-limit-storage.md
 */
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('TTL', KEYS[1])}
`;

/**
 * Whether the last attempt failed, so an outage logs once and not per request.
 *
 * decisions/318-rate-limit-storage.md
 */
let degraded = false;

/**
 * The counters used while Redis is unreachable: one process's own.
 *
 * decisions/318-rate-limit-storage.md
 */
const fallback = new Map<string, { count: number; expiresAt: number }>();

/**
 * How many keys the fallback holds before it sweeps the expired ones.
 *
 * decisions/318-rate-limit-storage.md
 */
const FALLBACK_SWEEP_AT = 10_000;

/**
 * How long to tell a refused client to wait, from Redis's `TTL`: at least a
 * second, and the whole window when the key has no expiry or is gone.
 *
 * decisions/318-rate-limit-storage.md
 */
function retryAfterFrom(ttl: number, rule: { window: number }): number {
  return ttl >= 0 ? Math.max(ttl, 1) : rule.window;
}

/**
 * How many keys the fallback is holding. Exported for the sweep test only.
 *
 * decisions/318-rate-limit-storage.md
 */
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
 * better-auth's `rateLimit.customStorage` shape, declared here and not imported.
 *
 * decisions/318-rate-limit-storage.md
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

        // Validated, not cast: a reply that is not two numbers is a failure like any
        // other.
        if (!Array.isArray(reply) || typeof reply[0] !== "number" || typeof reply[1] !== "number") {
          throw new TypeError("Rate limit script returned an unexpected shape");
        }
        const [count, ttl] = reply;

        if (degraded) {
          degraded = false;
          logger.info("Rate limit counters are reachable again");
        }

        const decision =
          count <= rule.max
            ? { allowed: true, retryAfter: null }
            : { allowed: false, retryAfter: retryAfterFrom(ttl, rule) };

        // A window counted in memory is enforced until it closes: while its entry is
        // live, the stricter of the two answers wins.
        const held = fallback.get(key);
        if (held !== undefined) {
          if (Date.now() < held.expiresAt) {
            const inMemory = consumeInMemory(key, rule);
            return inMemory.allowed ? decision : inMemory;
          }
          // Lapsed, and nothing will consult it again — dropping it here keeps
          // the map from holding one dead entry per client seen during an
          // outage until the size threshold happens to sweep.
          fallback.delete(key);
        }

        return decision;
      } catch (error) {
        // Degrade, do not disable: the count continues in memory. Logged once, at
        // error.
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
