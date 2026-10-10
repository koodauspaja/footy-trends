import * as Sentry from "@sentry/nextjs";

/**
 * The listener limit on every `ServerResponse`, raised so Next's and Sentry's
 * `close` listeners do not trip Node's leak warning. It covers every event a
 * response emits, and no other emitter.
 *
 * decisions/174-max-listeners-warning.md
 */
export const SERVER_RESPONSE_MAX_LISTENERS = 20;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Imported here, not at the top of the file: this module is bundled for the
    // edge runtime as well.
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
