import { afterEach, describe, expect, it, vi } from "vitest";
import { integrationDatabaseRefusal, namesTestDatabase } from "@/lib/test-database-name";
import guardIntegrationDatabase from "../../support/integration-database-guard";

/**
 * Which database names count as a test database, and what the integration suite
 * refuses to run against.
 *
 * decisions/479-integration-suite-database-guard.md
 * decisions/304-test-database.md
 * decisions/674-e2e-on-an-empty-database.md
 */

const TEST = "postgresql://postgres:secret@localhost:5432/footy-trends_test";
const DEV = "postgresql://postgres:secret@localhost:5432/footy-trends";
const INTEGRATION = "postgresql://postgres:secret@localhost:5432/footy-trends_integration_test";

describe("namesTestDatabase", () => {
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

describe("integrationDatabaseRefusal", () => {
  it("allows the suite's own database", () => {
    expect(integrationDatabaseRefusal({ DATABASE_URL: INTEGRATION })).toBeNull();
  });

  it("refuses the e2e suite's test database, which the TASO recorder reads", () => {
    expect(integrationDatabaseRefusal({ DATABASE_URL: TEST })).toContain(
      "localhost:5432/footy-trends_test"
    );
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

  it("lets no TEST_DATABASE_URL excuse a database that is not the suite's own", () => {
    for (const url of [TEST, "postgresql://ci@db.example.com/integration"]) {
      expect(
        integrationDatabaseRefusal({ DATABASE_URL: url, TEST_DATABASE_URL: url })
      ).not.toBeNull();
    }
  });
});

describe("the integration suite's globalSetup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stops the run on the development database", () => {
    vi.stubEnv("DATABASE_URL", DEV);
    vi.stubEnv("TEST_DATABASE_URL", "");

    expect(() => guardIntegrationDatabase()).toThrow(/Refusing to run the integration suite/);
  });

  it("lets the suite's own database through", () => {
    vi.stubEnv("DATABASE_URL", INTEGRATION);

    expect(() => guardIntegrationDatabase()).not.toThrow();
  });
});
