import { EventEmitter } from "node:events";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
vi.mock("../../sentry.server.config", () => ({}));
vi.mock("../../sentry.edge.config", () => ({}));

/** A real response object, which is what carries the raised limit. */
function serverResponse(): ServerResponse {
  return new ServerResponse(new IncomingMessage(new Socket()));
}

/**
 * `register` raises the listener limit for HTTP responses, because Next and
 * Sentry together attach eleven `close` listeners to every one of them. See
 * #174.
 *
 * `register` mutates `ServerResponse.prototype`, which is global to the
 * worker. Every test restores it, so a later test in the same worker still
 * sees Node's default and would still fail on a genuine listener leak.
 */
describe("instrumentation", () => {
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(ServerResponse.prototype, "_maxListeners");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    if (original === undefined) {
      delete (ServerResponse.prototype as { _maxListeners?: number })._maxListeners;
    } else {
      Object.defineProperty(ServerResponse.prototype, "_maxListeners", original);
    }
  });

  async function register(runtime: "nodejs" | "edge") {
    vi.stubEnv("NEXT_RUNTIME", runtime);
    const instrumentation = await import("@/instrumentation");
    await instrumentation.register();
  }

  it("raises the listener limit for ServerResponse on the Node runtime", async () => {
    await register("nodejs");

    // Eleven is what Next plus Sentry actually attach; the limit must clear it.
    expect(serverResponse().getMaxListeners()).toBeGreaterThan(11);
  });

  it("leaves every other emitter on Node's default, so a real leak still warns", async () => {
    await register("nodejs");

    expect(new EventEmitter().getMaxListeners()).toBe(EventEmitter.defaultMaxListeners);
  });

  /**
   * Node's limit is per emitter, not per event name. Pinned rather than fixed:
   * there is no per-event API, and this is the accepted cost of the trade.
   */
  it("raises the limit for every response event, not only close", async () => {
    await register("nodejs");
    const response = serverResponse();

    for (let i = 0; i < 15; i++) response.on("finish", () => {});

    expect(response.listenerCount("finish")).toBe(15);
    expect(response.getMaxListeners()).toBeGreaterThan(15);
  });

  it("does not touch the limit on the edge runtime, which has no ServerResponse", async () => {
    await register("edge");

    expect(serverResponse().getMaxListeners()).toBe(EventEmitter.defaultMaxListeners);
  });
});
