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
 *
 * Node's limit is per emitter, not per event name, so this raises the
 * threshold for every event a `ServerResponse` emits — not only `close`. That
 * is accepted deliberately: Node offers no per-event limit, and the
 * alternatives (a global default, or `--no-warnings`) give up more. The cost
 * is that a leak of 11–20 listeners of some other response event would go
 * unwarned; past 20 it still warns.
 *
 * `node:events` and `node:http` are imported inside the branch, not at the top
 * of the file: this module is bundled for the edge runtime as well, and a
 * static import of a Node builtin makes that bundle warn on every request —
 * which is the same noise this is meant to remove.
 */
export const SERVER_RESPONSE_MAX_LISTENERS = 20;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setMaxListeners } = await import("node:events");
    const { ServerResponse } = await import("node:http");
    setMaxListeners(SERVER_RESPONSE_MAX_LISTENERS, ServerResponse.prototype);
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
