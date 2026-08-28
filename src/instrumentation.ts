import * as Sentry from "@sentry/nextjs";

/**
 * Node warns once a single emitter passes ten listeners of one type, as a
 * rough leak heuristic. Next and Sentry together attach enough `close`
 * listeners to every `ServerResponse` to cross it: eleven on Next 16.3.0,
 * where this was diagnosed in #129 and silenced in #174. Nothing accumulates —
 * the listeners belong to one response object that is discarded when the
 * request ends — so the warning was a false positive throughout.
 *
 * The count is Next's to decide and it moves between releases. On 16.3.2 it
 * fell to eight in dev and seven in production, below Node's default, so the
 * warning does not currently fire at all; re-measured in #176. Treat the
 * numbers here as history and the document below as current.
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
