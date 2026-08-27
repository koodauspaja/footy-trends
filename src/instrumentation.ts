import { setMaxListeners } from "node:events";
import { ServerResponse } from "node:http";
import * as Sentry from "@sentry/nextjs";

/**
 * Node warns once a single emitter passes ten listeners of one type, as a
 * rough leak heuristic. Next attaches nine `close` listeners to every
 * `ServerResponse` on its own — seven from its bundled `httpxy` proxy, two
 * from `requestHandlerImpl` and `createAbortController` — and Sentry adds two
 * more, so every request crosses the threshold and logs
 * `MaxListenersExceededWarning`. Nothing accumulates: the listeners belong to
 * one response object that is discarded when the request ends.
 *
 * Raising the limit on `ServerResponse.prototype` covers every response
 * without touching any other emitter, so a genuine listener leak elsewhere
 * still warns at Node's default. Measured in #129, silenced in #174; the probe
 * for re-measuring after a Next or Sentry upgrade is in
 * docs/setup/017-sentry-setup.md.
 */
const SERVER_RESPONSE_CLOSE_LISTENERS = 20;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    setMaxListeners(SERVER_RESPONSE_CLOSE_LISTENERS, ServerResponse.prototype);
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
