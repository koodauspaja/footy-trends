import { logger } from "./logger";

/** One retry, not a loop: enough to clear a counter reset, bounded enough that a
 * page render cannot be held indefinitely by a provider that keeps refusing. */
const MAX_ATTEMPTS = 2;
/** Longer than football-data.org's 30-second window would ever need. */
const MAX_BACKOFF_SECONDS = 35;
/** When a provider rate-limits without saying for how long. */
const DEFAULT_BACKOFF_SECONDS = 10;

/**
 * How long to wait before retrying a rate-limited request.
 *
 * `Retry-After` is the standard header and is honoured first. football-data.org
 * does not send it — it sends `X-RequestCounter-Reset`, the seconds until its
 * per-minute counter clears — so that is read as well rather than falling back
 * to a guess that would either retry too early and fail again, or wait longer
 * than the provider needs.
 */
export function backoffSecondsFrom(headers: Headers): number {
  const candidates = [headers.get("retry-after"), headers.get("x-requestcounter-reset")];
  for (const raw of candidates) {
    if (raw === null) continue;
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

/** Abortable wait, so a caller with a timeout is not held by a backoff. */
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
 * provider (football-data.org, TASO): fetch, log success/failure the same
 * way, surface a provider-labeled error on a network failure or non-2xx
 * status. `buildHeaders` is called inside the same `try` as `fetch` itself,
 * so a header-construction error (e.g. a missing API key) is caught and
 * logged exactly like any other request failure, not thrown ahead of it.
 */
export async function fetchProviderJson<T>(
  providerLabel: string,
  baseUrl: string,
  path: string,
  buildHeaders: () => Record<string, string>,
  /**
   * Bounds the **whole call**, retries and backoff included. The health
   * endpoint sets it, because an endpoint that hangs until a probe times out
   * is worse than one that reports a provider as unreachable. See #182.
   */
  signal?: AbortSignal,
  /**
   * Bounds **one network attempt**, and each attempt gets a fresh one.
   *
   * Deliberately not the same thing as `signal`. A provider that accepts the
   * connection and then stalls has to be cut off — that is #363, where an
   * unbounded render let TASO hold 41 e2e specs until Playwright's own 30 s
   * fired. But a 429 is the one failure worth waiting out, and that wait is up
   * to `MAX_BACKOFF_SECONDS`. A timeout spanning the whole call would abort
   * every retry before it completed, turning a recoverable rate limit into the
   * "could not be loaded" page this retry exists to prevent.
   *
   * So the bound applies to the request, and the backoff is left alone.
   */
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

    // Rate limiting is the one failure worth waiting out. Without this a
    // refusal becomes a thrown error, the caller falls back to stored data, and
    // on a cold database there is none — so the page tells the reader the
    // standings could not be loaded when the truth is only "not yet". Every
    // other non-2xx still fails immediately: retrying a 404 or a 403 would
    // delay a real answer without changing it.
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
