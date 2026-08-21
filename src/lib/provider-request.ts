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
  buildHeaders: () => Record<string, string>
): Promise<T> {
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { headers: buildHeaders() });
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
