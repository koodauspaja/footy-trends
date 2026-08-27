import { EventEmitter } from "node:events";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
vi.mock("../../sentry.server.config", () => ({}));
vi.mock("../../sentry.edge.config", () => ({}));

/** A real response object, which is what carries the raised limit. */
function serverResponse(): ServerResponse {
  return new ServerResponse(new IncomingMessage(new Socket()));
}

/**
 * `register` raises the `close`-listener limit for HTTP responses, because
 * Next and Sentry together attach eleven to every one of them. See #174.
 */
describe("instrumentation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("raises the listener limit for ServerResponse on the Node runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("@/instrumentation");

    await register();

    // Eleven is what Next plus Sentry actually attach; the limit must clear it.
    expect(serverResponse().getMaxListeners()).toBeGreaterThan(11);
  });

  it("leaves every other emitter on Node's default, so a real leak still warns", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("@/instrumentation");

    await register();

    expect(new EventEmitter().getMaxListeners()).toBe(EventEmitter.defaultMaxListeners);
  });

  it("does not touch the limit on the edge runtime, which has no ServerResponse", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const before = serverResponse().getMaxListeners();
    const { register } = await import("@/instrumentation");

    await register();

    expect(serverResponse().getMaxListeners()).toBe(before);
  });
});
