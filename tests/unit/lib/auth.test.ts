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

const { customSession, getSessionExtrasFor } = vi.hoisted(() => ({
  customSession: vi.fn((fn: unknown) => ({ id: "custom-session", fn })),
  getSessionExtrasFor: vi.fn(async () => ({
    defaultRegion: "kotimaa",
    avatarVersion: "avatar-token",
  })),
}));

const { betterAuth, drizzleAdapter, nextCookies } = vi.hoisted(() => ({
  betterAuth: vi.fn((config: unknown) => ({ config })),
  drizzleAdapter: vi.fn((_db: unknown, config: unknown) => ({ adapter: config })),
  nextCookies: vi.fn(() => ({ id: "next-cookies" })),
}));

vi.mock("better-auth", () => ({ betterAuth }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter }));
vi.mock("better-auth/next-js", () => ({ nextCookies }));
vi.mock("better-auth/plugins/custom-session", () => ({ customSession }));
vi.mock("@/lib/preferences", () => ({ getSessionExtrasFor }));

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

describe("resolving the client IP, from #309", () => {
  it("reads the address from x-real-ip, the one header the edge overwrites", async () => {
    // Without a resolvable header better-auth falls back to one shared per-path
    // bucket, where one attacker locks everyone out. Railway's `x-forwarded-for`
    // arrives with two entries, which better-auth refuses to read unaided.
    //
    // `x-real-ip` and not `x-envoy-external-address`: a sentinel sent as the
    // first is overwritten by the edge, and one sent as the second arrives
    // intact, because Railway never sets it. An absent header a client may set
    // is worse than no configuration at all — ordinary visitors still share a
    // bucket and an attacker rotates theirs freely.
    setEnv();

    const config = await loadConfig();

    expect(config.advanced.ipAddress.ipAddressHeaders).toEqual(["x-real-ip"]);
  });

  it("trusts no proxy unless one is configured", async () => {
    // Absent rather than empty: an empty list leaves chain mode disabled
    // anyway, and saying nothing is plainer than saying nothing-in-particular.
    setEnv();

    const config = await loadConfig();

    expect(config.advanced.ipAddress).not.toHaveProperty("trustedProxies");
  });

  it("takes the header list from the environment, so a wrong guess is not a release", async () => {
    setEnv({ AUTH_CLIENT_IP_HEADERS: "CF-Connecting-IP, x-real-ip" });

    const config = await loadConfig();

    // Lower-cased, because `Headers.get` is case-insensitive but better-auth
    // compares the configured name against the key it was given.
    expect(config.advanced.ipAddress.ipAddressHeaders).toEqual(["cf-connecting-ip", "x-real-ip"]);
  });

  it("passes trusted proxies through when they are configured", async () => {
    setEnv({ AUTH_TRUSTED_PROXIES: "100.64.0.0/10, 10.0.0.1" });

    const config = await loadConfig();

    expect(config.advanced.ipAddress.trustedProxies).toEqual(["100.64.0.0/10", "10.0.0.1"]);
  });

  it("falls back to the default when the variable is set but empty", async () => {
    // A Railway variable cleared to "" must not disable IP resolution silently.
    setEnv({ AUTH_CLIENT_IP_HEADERS: " , ,, " });

    const config = await loadConfig();

    expect(config.advanced.ipAddress.ipAddressHeaders).toEqual(["x-real-ip"]);
  });
});

describe("where rate-limit counters live, from #318", () => {
  it("counts in Redis rather than in this instance's memory", async () => {
    // better-auth's default is an in-process Map: it resets on every deploy and
    // becomes one limiter per instance the moment there are two.
    setEnv();

    const config = await loadConfig();

    expect(config.rateLimit.customStorage).toEqual(
      expect.objectContaining({ consume: expect.any(Function) })
    );
  });

  it("leaves sessions in Postgres", async () => {
    // `secondaryStorage` is the option better-auth documents for this, and it
    // also moves sessions — reads come from it and rows are deleted from the
    // database — which would make sign-in depend on Redis being up.
    // `customStorage` is consulted first, so only the counters move.
    setEnv();

    const config = await loadConfig();

    expect(config.secondaryStorage).toBeUndefined();
  });
});

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

  it("puts the start-page preference on the session the browser fetches", async () => {
    // Enriching `/api/auth/get-session` rather than adding a second client
    // fetch: `/` is prerendered and applies the preference in the browser.
    setEnv();
    await loadConfig();

    const enrich = customSession.mock.calls[0]?.[0] as (input: unknown) => Promise<unknown>;
    const user = { id: "user-1", name: "Matti" };
    const session = { id: "session-1" };

    // Both extras are spread onto the session the browser already fetches:
    // the start-page preference, and the avatar version the client turns into
    // `/api/avatar/me?v=…`.
    expect(await enrich({ user, session })).toEqual({
      user,
      session,
      defaultRegion: "kotimaa",
      avatarVersion: "avatar-token",
    });
    expect(getSessionExtrasFor).toHaveBeenCalledWith("user-1");
  });

  it("enables account deletion, which the settings page needs", async () => {
    setEnv();

    const config = await loadConfig();

    // Off by default in better-auth; `Poista tili` in specs/024 depends on it.
    expect(config.user.deleteUser.enabled).toBe(true);
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
    // `customSession` joined it in specs/024, to put the start-page preference
    // on the session the browser already fetches. `nextCookies` must stay last.
    expect(config.plugins).toHaveLength(2);
    expect(config.plugins.at(-1)).toBe(nextCookies.mock.results.at(-1)?.value);
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
