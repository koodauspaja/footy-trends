import { afterEach, describe, expect, it, vi } from "vitest";
import { integrationDatabaseRefusal, namesTestDatabase } from "@/lib/test-database-name";
import guardIntegrationDatabase from "../../support/integration-database-guard";

/**
 * Which database names count as a test database, and what the integration suite
 * refuses to run against.
 *
 * decisions/479-integration-suite-database-guard.md
 */

const TEST = "postgresql://postgres:secret@localhost:5432/footy-trends_test";
const DEV = "postgresql://postgres:secret@localhost:5432/footy-trends";

describe("namesTestDatabase (#479)", () => {
  it("accepts a database whose name ends in _test", () => {
    expect(namesTestDatabase(TEST)).toBe(true);
    // Percent-encoded, as a connection string may carry it.
    expect(namesTestDatabase("postgresql://localhost/footy%2Dtrends_test")).toBe(true);
  });

  it.each([
    ["the development database", DEV],
    ["a name that only contains _test", "postgresql://localhost/footy_test_trends"],
    ["a URL naming no database", "postgresql://localhost:5432"],
    ["a URL that cannot be parsed", "not a url"],
    ["no URL at all", undefined],
  ])("refuses %s", (_name, url) => {
    expect(namesTestDatabase(url)).toBe(false);
  });
});

describe("integrationDatabaseRefusal (#479)", () => {
  it("allows the test database", () => {
    expect(integrationDatabaseRefusal({ DATABASE_URL: TEST })).toBeNull();
  });

  it("refuses the development database, naming it without its password", () => {
    const refusal = integrationDatabaseRefusal({ DATABASE_URL: DEV });

    expect(refusal).toContain("localhost:5432/footy-trends");
    expect(refusal).toContain("npm run test:integration");
    expect(refusal).not.toContain("secret");
  });

  it.each([
    ["no DATABASE_URL", {}, "no DATABASE_URL at all"],
    ["a blank one", { DATABASE_URL: "  " }, "no DATABASE_URL at all"],
    ["an unparseable one", { DATABASE_URL: "not a url" }, "an unparseable DATABASE_URL"],
  ])("refuses %s, and says which", (_name, env, said) => {
    expect(integrationDatabaseRefusal(env)).toContain(said);
  });

  it("allows #304's explicit TEST_DATABASE_URL override, whatever its name", () => {
    const override = "postgresql://ci@db.example.com/integration";

    expect(
      integrationDatabaseRefusal({ DATABASE_URL: override, TEST_DATABASE_URL: ` ${override} ` })
    ).toBeNull();
  });

  it("does not let an override excuse a different database", () => {
    expect(
      integrationDatabaseRefusal({
        DATABASE_URL: DEV,
        TEST_DATABASE_URL: "postgresql://ci@db.example.com/integration",
      })
    ).not.toBeNull();
    // A blank override is no override.
    expect(
      integrationDatabaseRefusal({ DATABASE_URL: DEV, TEST_DATABASE_URL: " " })
    ).not.toBeNull();
  });
});

describe("the integration suite's globalSetup (#479)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stops the run on the development database", () => {
    vi.stubEnv("DATABASE_URL", DEV);
    vi.stubEnv("TEST_DATABASE_URL", "");

    expect(() => guardIntegrationDatabase()).toThrow(/Refusing to run the integration suite/);
  });

  it("lets the test database through", () => {
    vi.stubEnv("DATABASE_URL", TEST);

    expect(() => guardIntegrationDatabase()).not.toThrow();
  });
});
