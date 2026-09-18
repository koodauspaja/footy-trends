import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { init, captureRouterTransitionStart } = vi.hoisted(() => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ init, captureRouterTransitionStart }));

/**
 * The browser half of the Sentry wiring, which runs at import — so the test is
 * the import, with the environment stubbed first.
 *
 * `@/lib/sentry-config` is deliberately **not** mocked: how a blank variable is
 * read is the thing worth asserting end to end, and it is the difference between
 * production tracing at 10% and tracing everything.
 */
async function load(): Promise<void> {
  await import("@/instrumentation-client");
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instrumentation-client", () => {
  it("initialises Sentry once, with the DSN the browser was built with", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@example.ingest.sentry.io/1");

    await load();

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: "https://key@example.ingest.sentry.io/1" })
    );
  });

  it("reads the NEXT_PUBLIC_ values, which are the only ones a browser can see", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "0.1");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENABLE_LOGS", "true");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII", "false");

    await load();

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.1, enableLogs: true, sendDefaultPii: false })
    );
  });

  it("does not read the server-only spellings, which are undefined in a browser", async () => {
    // A server-only variable is not inlined into the bundle, so reading one here
    // would mean the client silently kept the development defaults in
    // production — the failure #021 documents.
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "0.05");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "");

    await load();

    expect(init).not.toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 0.05 }));
  });

  it("passes no `integrations` at all, rather than an empty list", async () => {
    /**
     * The distinction the comment in the file is about: `integrations: []`
     * *replaces* Sentry's defaults rather than removing Replay from them, taking
     * the global error handlers, breadcrumbs and request context with it. Omitting
     * the option keeps every default, and Replay is not among them.
     */
    await load();

    const options = init.mock.calls[0]?.[0] as Record<string, unknown> | undefined;

    expect(options).toBeDefined();
    expect(options && "integrations" in options).toBe(false);
  });

  it("exports Sentry's router-transition hook for Next to call", async () => {
    const module = await import("@/instrumentation-client");

    expect(module.onRouterTransitionStart).toBe(captureRouterTransitionStart);
  });
});
