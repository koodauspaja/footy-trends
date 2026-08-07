import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      target: "@axiomhq/pino",
      options: {
        dataset: "dataset",
        token: "token",
      },
    });
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
