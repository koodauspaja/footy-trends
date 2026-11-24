import { logger } from "../platform/logger";
import { redis } from "../platform/redis";

/**
 * How long a path that failed is left alone: a request for it meanwhile fails
 * at once, and readers see the stored rows, as after any failed refresh.
 *
 * decisions/880-bounded-provider-requests.md
 */
export const FAILURE_COOLDOWN_SECONDS = 60;

/**
 * A request not made, because the same path failed within the cooldown.
 *
 * decisions/880-bounded-provider-requests.md
 */
export class ProviderCoolingDownError extends Error {}

/**
 * Where a path's cooldown is kept: one per provider and path, TASO's trailing
 * signature left out, so the same request signed again is the same path.
 *
 * decisions/880-bounded-provider-requests.md
 */
export function cooldownKey(providerLabel: string, path: string): string {
  return `provider-cooldown:${providerLabel}:${path.replace(/[?&]hash=[^&]*$/, "")}`;
}

async function coolingDown(key: string): Promise<boolean> {
  try {
    return (await redis.get(key)) !== null;
  } catch (error) {
    // Redis down: ask the provider, as before the cooldown existed.
    logger.error({ err: error, key }, "Cache read failed");
    return false;
  }
}

async function startCooldown(key: string): Promise<void> {
  try {
    await redis.setex(key, FAILURE_COOLDOWN_SECONDS, "1");
  } catch (error) {
    logger.error({ err: error, key }, "Cache write failed");
  }
}

/**
 * One retry, not a loop: enough to clear a counter reset, bounded enough that a
 * page render cannot be held indefinitely by a provider that keeps refusing.
 *
 * decisions/197-rate-limit-backoff.md
 */
const MAX_ATTEMPTS = 2;
/**
 * Longer than football-data.org's 30-second window would ever need.
 *
 * decisions/197-rate-limit-backoff.md
 */
const MAX_BACKOFF_SECONDS = 35;
/**
 * When a provider rate-limits without saying for how long.
 *
 * decisions/197-rate-limit-backoff.md
 */
const DEFAULT_BACKOFF_SECONDS = 10;

/**
 * How long to wait before retrying a rate-limited request. `Retry-After` is
 * honoured first, then football-data.org's `X-RequestCounter-Reset`.
 *
 * decisions/197-rate-limit-backoff.md
 */
export function backoffSecondsFrom(headers: Headers): number {
  const candidates = [headers.get("retry-after"), headers.get("x-requestcounter-reset")];
  for (const raw of candidates) {
    // An empty header says nothing, and `Number("")` is 0: skipped, so it
    // cannot mean "retry at once".
    if (raw === null || raw.trim() === "") continue;
    const seconds = Number(raw.trim());
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.ceil(seconds), MAX_BACKOFF_SECONDS);
    }
    // `Retry-After` may be an HTTP date rather than a count of seconds.
    const at = Date.parse(raw);
    if (!Number.isNaN(at)) {
      return Math.min(Math.max(0, Math.ceil((at - Date.now()) / 1000)), MAX_BACKOFF_SECONDS);
    }
  }
  return DEFAULT_BACKOFF_SECONDS;
}

/**
 * Abortable wait, so a caller with a timeout is not held by a backoff.
 *
 * decisions/197-rate-limit-backoff.md
 */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The GET-JSON-with-timing-and-logging shape shared by every external data
 * provider. `buildHeaders` runs inside the same `try` as `fetch`, so a missing
 * API key is logged like any other request failure.
 *
 * decisions/009-veikkausliiga.md
 * decisions/197-rate-limit-backoff.md
 * decisions/363-render-timeouts.md
 * decisions/880-bounded-provider-requests.md
 */
export async function fetchProviderJson<T>(
  providerLabel: string,
  baseUrl: string,
  path: string,
  buildHeaders: () => Record<string, string>,
  /**
   * Bounds the whole call, retries and backoff included. The health endpoint
   * sets it.
   */
  signal?: AbortSignal,
  /**
   * Bounds one network attempt, and each attempt gets a fresh one. Not the same
   * thing as `signal`: the backoff between attempts is left alone.
   */
  attemptTimeoutMs?: number
): Promise<T> {
  const cooldown = cooldownKey(providerLabel, path);
  if (await coolingDown(cooldown)) {
    throw new ProviderCoolingDownError(
      `${providerLabel} request skipped: the path failed within ${FAILURE_COOLDOWN_SECONDS} s`
    );
  }
  try {
    return await requestWithRetry<T>(
      providerLabel,
      baseUrl,
      path,
      buildHeaders,
      signal,
      attemptTimeoutMs
    );
  } catch (error) {
    // A caller giving up is not the provider failing; its own timeout per attempt is.
    if (!signal?.aborted) await startCooldown(cooldown);
    throw error;
  }
}

// `fetchProviderJson`'s request and its one retry, with the parameters it documents.
async function requestWithRetry<T>(
  providerLabel: string,
  baseUrl: string,
  path: string,
  buildHeaders: () => Record<string, string>,
  signal?: AbortSignal,
  attemptTimeoutMs?: number
): Promise<T> {
  const startedAt = Date.now();

  for (let attempt = 1; ; attempt += 1) {
    // Fresh per attempt: `AbortSignal.timeout` counts from creation, so one
    // signal reused across attempts would give the retry whatever was left.
    const attemptSignal =
      attemptTimeoutMs === undefined ? undefined : AbortSignal.timeout(attemptTimeoutMs);
    const signals = [signal, attemptSignal].filter((s) => s !== undefined);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        headers: buildHeaders(),
        // Spread rather than `signal: signal ?? null`, so a caller that passes
        // neither sends exactly the request it sent before.
        ...(signals.length > 0 ? { signal: AbortSignal.any(signals) } : {}),
      });
    } catch (error) {
      logger.error(
        { err: error, method: "GET", path, durationMs: Date.now() - startedAt },
        `${providerLabel} request failed`
      );
      throw error;
    }

    const durationMs = Date.now() - startedAt;

    // Rate limiting is the one failure worth waiting out. Every other non-2xx
    // still fails immediately.
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const seconds = backoffSecondsFrom(response.headers);
      logger.warn(
        { method: "GET", path, status: response.status, durationMs, retryInSeconds: seconds },
        `${providerLabel} rate limited; retrying`
      );
      // The caller's signal only. Bounding the backoff by the per-attempt
      // timeout would defeat the retry entirely — see `attemptTimeoutMs`.
      await wait(seconds * 1000, signal);
      continue;
    }

    if (!response.ok) {
      logger.error(
        { method: "GET", path, status: response.status, durationMs },
        `${providerLabel} request failed`
      );
      throw new Error(`${providerLabel} request failed: ${response.status}`);
    }

    logger.info(
      { method: "GET", path, status: response.status, durationMs },
      `${providerLabel} request completed`
    );
    return (await response.json()) as T;
  }
}
