import { existsSync } from "node:fs";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

vi.mock("pino", () => {
  const pinoMock = vi.fn();
  Object.assign(pinoMock, { transport: vi.fn() });

  return {
    default: pinoMock,
  };
});

type PinoMock = ReturnType<typeof vi.fn> & {
  transport: ReturnType<typeof vi.fn>;
};

const mockedPino = pino as unknown as PinoMock;
const originalEnv = { ...process.env };

function setNodeEnv(value: "development" | "production" | "test") {
  process.env = {
    ...process.env,
    NODE_ENV: value,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

warmModules(() => import("@/lib/logger"));

describe("logger", () => {
  it("uses debug level by default in non-production without Axiom transport", async () => {
    setNodeEnv("development");
    delete process.env.LOG_LEVEL;
    delete process.env.AXIOM_TOKEN;
    delete process.env.AXIOM_DATASET;

    await import("@/lib/logger");

    expect(mockedPino.transport).not.toHaveBeenCalled();
    expect(mockedPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "debug",
        base: expect.objectContaining({
          service: "footy-trends",
          env: "development",
        }),
      })
    );
  });

  it("is silent by default under test, so app logs are not test output", async () => {
    // A page test that renders a competition page reaches getViewerPreferences,
    // whose headers() call throws outside a request scope — the graceful
    // degradation working as designed — and printed a stack trace every time.
    setNodeEnv("test");
    delete process.env.LOG_LEVEL;

    await import("@/lib/logger");

    expect(mockedPino).toHaveBeenCalledWith(expect.objectContaining({ level: "silent" }));
  });

  it("still obeys LOG_LEVEL under test, so a developer can turn them back on", async () => {
    setNodeEnv("test");
    process.env.LOG_LEVEL = "debug";

    await import("@/lib/logger");

    expect(mockedPino).toHaveBeenCalledWith(expect.objectContaining({ level: "debug" }));
  });

  it("uses info level by default in production", async () => {
    setNodeEnv("production");
    delete process.env.LOG_LEVEL;
    delete process.env.AXIOM_TOKEN;
    delete process.env.AXIOM_DATASET;

    await import("@/lib/logger");

    expect(mockedPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
      })
    );
  });

  it("creates Axiom transport when token and dataset are present outside test", async () => {
    setNodeEnv("production");
    process.env.AXIOM_TOKEN = "token";
    process.env.AXIOM_DATASET = "dataset";
    process.env.LOG_LEVEL = "warn";

    const transport = { name: "axiom-transport" };
    mockedPino.transport.mockReturnValue(transport);

    await import("@/lib/logger");

    expect(mockedPino.transport).toHaveBeenCalledWith({
      target: expect.any(String),
      options: {
        dataset: "dataset",
        token: "token",
      },
    });

    // The path pino is given, not a name it has to find: inside Next's bundle it
    // cannot. decisions/574-pino-transport-target.md
    const [{ target }] = mockedPino.transport.mock.calls[0] as [{ target: string }];
    expect(path.isAbsolute(target)).toBe(true);
    expect(target).toContain(path.join("node_modules", "@axiomhq", "pino"));
    expect(existsSync(target)).toBe(true);
    expect(mockedPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
      }),
      transport
    );
  });

  it("does not create Axiom transport in test environment", async () => {
    setNodeEnv("test");
    process.env.AXIOM_TOKEN = "token";
    process.env.AXIOM_DATASET = "dataset";

    await import("@/lib/logger");

    expect(mockedPino.transport).not.toHaveBeenCalled();
    expect(mockedPino).toHaveBeenCalledWith(expect.any(Object));
  });
});
