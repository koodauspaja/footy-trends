import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `auth.ts` reads four environment variables at import and builds a database
 * adapter, so nothing here may touch the real `postgres` client or inherit an
 * ambient environment: the CI `unit` job runs with no service containers and no
 * env vars at all, deliberately (#158). Same mocking shape as
 * tests/unit/db/index.test.ts.
 */
vi.mock("postgres", () => ({ default: vi.fn(() => ({ end: vi.fn() })) }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: vi.fn(() => ({})) }));

const { betterAuth, drizzleAdapter, nextCookies } = vi.hoisted(() => ({
  betterAuth: vi.fn((config: unknown) => ({ config })),
  drizzleAdapter: vi.fn((_db: unknown, config: unknown) => ({ adapter: config })),
  nextCookies: vi.fn(() => ({ id: "next-cookies" })),
}));

vi.mock("better-auth", () => ({ betterAuth }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter }));
vi.mock("better-auth/next-js", () => ({ nextCookies }));

const REQUIRED = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...REQUIRED, ...overrides })) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
}

beforeEach(() => {
  vi.resetModules();
  betterAuth.mockClear();
  drizzleAdapter.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The config object handed to `betterAuth()`, typed loosely on purpose. */
// biome-ignore lint/suspicious/noExplicitAny: asserting on a third-party config shape
async function loadConfig(): Promise<any> {
  await import("@/lib/auth");
  return betterAuth.mock.calls[0]?.[0];
}

describe("auth configuration", () => {
  it("registers Google as the only social provider", async () => {
    setEnv();

    const config = await loadConfig();

    expect(Object.keys(config.socialProviders)).toEqual(["google"]);
    expect(config.socialProviders.google).toMatchObject({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
    });
  });

  it("wires the Drizzle adapter to Postgres with all four better-auth models", async () => {
    setEnv();

    await loadConfig();

    expect(drizzleAdapter).toHaveBeenCalledTimes(1);
    const [, adapterConfig] = drizzleAdapter.mock.calls[0] as [
      unknown,
      { schema: object; provider: string },
    ];
    expect(adapterConfig.provider).toBe("pg");
    // Missing any one of these makes better-auth fail at the callback, not here.
    expect(Object.keys(adapterConfig.schema).sort()).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);
  });

  it("keeps the cookie session cache off, so sign-out revokes immediately", async () => {
    setEnv();

    const config = await loadConfig();

    expect(config.session.cookieCache.enabled).toBe(false);
  });

  it("registers the Next cookie plugin, without which no session persists", async () => {
    setEnv();

    const config = await loadConfig();

    expect(nextCookies).toHaveBeenCalled();
    expect(config.plugins).toHaveLength(1);
  });

  it("maps a nameless Google profile to a usable name", async () => {
    setEnv();

    const config = await loadConfig();

    expect(config.socialProviders.google.mapProfileToUser({ email: "matti@example.com" })).toEqual({
      name: "matti",
    });
  });

  it.each(["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])(
    "refuses to construct without %s, naming it",
    async (missing) => {
      setEnv({ [missing]: undefined });

      // The failure this prevents is a build that starts fine and only breaks
      // when a reader clicks `Kirjaudu sisään` in production.
      await expect(import("@/lib/auth")).rejects.toThrow(missing);
    }
  );
});
