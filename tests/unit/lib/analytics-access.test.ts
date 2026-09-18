import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserId, requestHeaders, loggerError } = vi.hoisted(() => ({
  currentUserId: vi.fn<() => Promise<string | null>>(),
  requestHeaders: { value: new Headers() },
  loggerError: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError } }));

import { canSeeAnalytics } from "@/lib/analytics-access";
import {
  E2E_ANALYTICS_FLAG,
  E2E_ANALYTICS_HEADER,
  E2E_SIGNED_IN,
  e2eOverrideAllowed,
} from "@/lib/e2e-analytics";

const TEST_DATABASE = "postgresql://postgres:pw@localhost:5432/footy-trends_test";
const DEV_DATABASE = "postgresql://postgres:pw@localhost:5432/footy-trends";
const PRODUCTION = "postgresql://postgres:secret@db.railway.internal:5432/railway";

beforeEach(() => {
  vi.unstubAllEnvs();
  currentUserId.mockReset();
  loggerError.mockReset();
  requestHeaders.value = new Headers();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("e2eOverrideAllowed", () => {
  it("allows the override on the e2e server: the flag set, and a test database", () => {
    expect(e2eOverrideAllowed({ [E2E_ANALYTICS_FLAG]: "1", DATABASE_URL: TEST_DATABASE })).toBe(
      true
    );
  });

  it.each([
    ["production's database", PRODUCTION],
    ["the development database", DEV_DATABASE],
    ["no database at all", undefined],
    ["a URL that cannot be read", "not a url"],
  ])("refuses it against %s, even with the flag set", (_, url) => {
    // The flag alone must never be enough: a variable copied into production by
    // mistake would otherwise show analytics to everyone.
    expect(e2eOverrideAllowed({ [E2E_ANALYTICS_FLAG]: "1", DATABASE_URL: url })).toBe(false);
  });

  it.each([undefined, "", "0", "true"])("refuses it when the flag is %j", (flag) => {
    expect(e2eOverrideAllowed({ [E2E_ANALYTICS_FLAG]: flag, DATABASE_URL: TEST_DATABASE })).toBe(
      false
    );
  });

  it("reads the database name decoded, as the connection would", () => {
    const encoded = "postgresql://postgres:pw@localhost:5432/footy-trends%5Ftest";

    expect(e2eOverrideAllowed({ [E2E_ANALYTICS_FLAG]: "1", DATABASE_URL: encoded })).toBe(true);
  });
});

describe("canSeeAnalytics", () => {
  it("lets a signed-in reader see analytics", async () => {
    currentUserId.mockResolvedValue("user-1");

    expect(await canSeeAnalytics()).toBe(true);
  });

  it("refuses a signed-out reader", async () => {
    currentUserId.mockResolvedValue(null);

    expect(await canSeeAnalytics()).toBe(false);
  });

  it("fails closed, and logs it, when the session cannot be read", async () => {
    // Failing open would show analytics to someone who is not signed in.
    currentUserId.mockRejectedValue(new Error("auth down"));

    expect(await canSeeAnalytics()).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Unable to read the session for analytics"
    );
  });

  it("treats a flagged request as signed in on the e2e server, without asking for a session", async () => {
    vi.stubEnv(E2E_ANALYTICS_FLAG, "1");
    vi.stubEnv("DATABASE_URL", TEST_DATABASE);
    requestHeaders.value = new Headers({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });

    expect(await canSeeAnalytics()).toBe(true);
    expect(currentUserId).not.toHaveBeenCalled();
  });

  it("treats a request without the header as signed out, on the same e2e server", async () => {
    // What lets the suite test the signed-out prompt end to end as well.
    vi.stubEnv(E2E_ANALYTICS_FLAG, "1");
    vi.stubEnv("DATABASE_URL", TEST_DATABASE);
    currentUserId.mockResolvedValue(null);

    expect(await canSeeAnalytics()).toBe(false);
  });

  it("ignores the header outside the e2e server — a client cannot sign itself in", async () => {
    vi.stubEnv(E2E_ANALYTICS_FLAG, "1");
    vi.stubEnv("DATABASE_URL", PRODUCTION);
    requestHeaders.value = new Headers({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
    currentUserId.mockResolvedValue(null);

    expect(await canSeeAnalytics()).toBe(false);
  });

  it("ignores a header with any other value", async () => {
    vi.stubEnv(E2E_ANALYTICS_FLAG, "1");
    vi.stubEnv("DATABASE_URL", TEST_DATABASE);
    requestHeaders.value = new Headers({ [E2E_ANALYTICS_HEADER]: "yes" });
    currentUserId.mockResolvedValue(null);

    expect(await canSeeAnalytics()).toBe(false);
  });
});
