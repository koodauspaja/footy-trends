import { logger } from "./logger";

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
   * Bounds the request. Page renders leave this unset and rely on the
   * platform's own limits; the health endpoint sets it, because an endpoint
   * that hangs until a probe times out is worse than one that reports a
   * provider as unreachable. See #182.
   */
  signal?: AbortSignal
): Promise<T> {
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: buildHeaders(),
      // Spread rather than `signal: signal ?? null`, so a caller that passes
      // none sends exactly the request it sent before.
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    logger.error(
      { err: error, method: "GET", path, durationMs: Date.now() - startedAt },
      `${providerLabel} request failed`
    );
    throw error;
  }

  const durationMs = Date.now() - startedAt;

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
