import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const pingMock = vi.fn();
const getCurrentSeasonMock = vi.fn();
const loggerErrorMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerInfoMock = vi.fn();

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

vi.mock("@/lib/taso", () => ({
  getCurrentSeason: getCurrentSeasonMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
    info: loggerInfoMock,
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
    getCurrentSeasonMock.mockResolvedValue(2026);
  });

  it("returns healthy response and logs one info entry when database and redis checks pass", async () => {
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
      taso: "ok",
    });
    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/api/health",
        status: 200,
        checks: { database: "ok", redis: "ok", taso: "ok" },
      }),
      "API request completed"
    );
  });

  it("returns 503, logs normalized database error, and logs one info entry when database check fails", async () => {
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
      taso: "ok",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith({ err: dbError }, "Database health check failed");
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 503,
        checks: { database: "error", redis: "ok", taso: "ok" },
      }),
      "API request completed"
    );
  });

  it("logs normalized redis error, still returns 200, and logs one info entry when database check passes", async () => {
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
      taso: "ok",
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: { error: "redis unavailable" } },
      "Redis health check failed"
    );
    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        checks: { database: "ok", redis: "error", taso: "ok" },
      }),
      "API request completed"
    );
  });

  it("returns 503, logs both errors, and logs one info entry when database and redis checks both fail", async () => {
    const dbError = new Error("database down");
    executeMock.mockRejectedValue(dbError);
    pingMock.mockRejectedValue("redis unavailable");

    const GET = await loadGetRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.checks).toEqual({
      database: "error",
      redis: "error",
      taso: "ok",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith({ err: dbError }, "Database health check failed");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: { error: "redis unavailable" } },
      "Redis health check failed"
    );
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 503,
        checks: { database: "error", redis: "error", taso: "ok" },
      }),
      "API request completed"
    );
  });
});

describe("GET /api/health — provider check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    executeMock.mockResolvedValue(undefined);
    pingMock.mockResolvedValue("PONG");
  });

  /**
   * The season is discovered from TASO rather than derived from the clock: a
   * calendar-year guess would report a false failure every January, before
   * TASO publishes the new season.
   */
  it("asks the provider which season it publishes, naming no competition", async () => {
    getCurrentSeasonMock.mockResolvedValue(2026);
    const GET = await loadGetRoute();

    await GET();

    expect(getCurrentSeasonMock).toHaveBeenCalledWith();
  });

  it("reports the provider as ok when it answers", async () => {
    getCurrentSeasonMock.mockResolvedValue(2026);
    const GET = await loadGetRoute();

    const body = await (await GET()).json();

    expect(body.checks.taso).toBe("ok");
  });

  /**
   * The gap #182 exposed: every page but one was fine, the endpoint reported
   * everything healthy, and there was no way to ask whether the provider was
   * reachable short of probing pages one at a time.
   */
  it("reports the provider as error when it cannot be reached", async () => {
    getCurrentSeasonMock.mockRejectedValue(new Error("TASO request failed: 403"));
    const GET = await loadGetRoute();

    const response = await GET();
    const body = await response.json();

    expect(body.checks.taso).toBe("error");
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.anything(), "TASO health check failed");
  });

  /**
   * Non-fatal on purpose: pages backed by stored rows keep serving, so a
   * provider outage must not make the whole service look down to a platform
   * health probe.
   */
  it("stays 200 when only the provider is unreachable", async () => {
    getCurrentSeasonMock.mockRejectedValue(new Error("TASO request failed: 403"));
    const GET = await loadGetRoute();

    const response = await GET();

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("ok");
  });
});
