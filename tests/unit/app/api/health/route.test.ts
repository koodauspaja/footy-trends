import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const pingMock = vi.fn();
const loggerErrorMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    execute: executeMock,
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    ping: pingMock,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
  },
}));

async function loadGetRoute() {
  const module = await import("@/app/api/health/route");
  return module.GET;
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns healthy response without logging when database and redis checks pass", async () => {
    executeMock.mockResolvedValue(undefined);
    pingMock.mockResolvedValue("PONG");

    const GET = await loadGetRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({
      database: "ok",
      redis: "ok",
    });
    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("returns 503 and logs normalized database error when database check fails", async () => {
    const dbError = new Error("database down");
    executeMock.mockRejectedValue(dbError);
    pingMock.mockResolvedValue("PONG");

    const GET = await loadGetRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.checks).toEqual({
      database: "error",
      redis: "ok",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith({ err: dbError }, "Database health check failed");
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("logs normalized redis error but still returns 200 when database check passes", async () => {
    executeMock.mockResolvedValue(undefined);
    pingMock.mockRejectedValue("redis unavailable");

    const GET = await loadGetRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({
      database: "ok",
      redis: "error",
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: { error: "redis unavailable" } },
      "Redis health check failed"
    );
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});
