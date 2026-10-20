import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  integrationDatabaseRefusal,
  namesTestDatabase,
  parseDatabaseUrl,
} from "@/lib/test-database-name";
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

describe("parseDatabaseUrl", () => {
  it("parses a valid URL", () => {
    expect(parseDatabaseUrl(TEST, "The test database URL").pathname).toBe("/footy-trends_test");
  });

  it("names what was malformed, and carries neither the URL nor Node's error with it", () => {
    let error: unknown;
    try {
      parseDatabaseUrl("postgresql://postgres:hunter2@bad host/x", "DATABASE_URL");
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toEqual(new Error("DATABASE_URL is not a valid URL."));
    expect(inspect(error)).not.toContain("hunter2");
  });
});

describe("integrationDatabaseRefusal", () => {
  it("allows exactly the database derived for the suite", () => {
    expect(integrationDatabaseRefusal(INTEGRATION, INTEGRATION)).toBeNull();
  });

  it("refuses another database whose name ends as the suite's does, naming it without its password", () => {
    const elsewhere = "postgresql://ops:secret@db.example.com:5432/footy-trends_integration_test";
    const refusal = integrationDatabaseRefusal(elsewhere, INTEGRATION);

    expect(refusal).toContain("db.example.com:5432/footy-trends_integration_test");
    expect(refusal).not.toContain("secret");
  });

  it.each([
    ["the e2e suite's test database, which the TASO recorder reads", TEST],
    ["the development database", DEV],
  ])("refuses %s", (_name, url) => {
    expect(integrationDatabaseRefusal(url, INTEGRATION)).toContain(
      "Refusing to run the integration suite"
    );
  });

  it("refuses even the suite's own name when nothing could be derived to compare it with", () => {
    expect(integrationDatabaseRefusal(INTEGRATION, null)).toContain("npm run test:integration");
  });

  it.each([
    ["no DATABASE_URL", undefined, "no DATABASE_URL at all"],
    ["a blank one", "  ", "no DATABASE_URL at all"],
    ["an unparseable one", "not a url", "an unparseable DATABASE_URL"],
  ])("refuses %s, and says which", (_name, url, said) => {
    expect(integrationDatabaseRefusal(url, INTEGRATION)).toContain(said);
  });
});

describe("the integration suite's globalSetup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets through the database npm run test:integration hands it", () => {
    // What `scripts/with-test-db.ts` sets: the derived database, and the test
    // database it was derived from.
    vi.stubEnv("TEST_DATABASE_URL", TEST);
    vi.stubEnv("DATABASE_URL", INTEGRATION);

    expect(() => guardIntegrationDatabase()).not.toThrow();
  });

  it("stops a run pointed at another database named like the suite's", () => {
    vi.stubEnv("TEST_DATABASE_URL", TEST);
    vi.stubEnv("DATABASE_URL", "postgresql://ops:secret@db.example.com:5432/x_integration_test");

    expect(() => guardIntegrationDatabase()).toThrow(/Refusing to run the integration suite/);
  });

  it("stops a run started without the wrapper, even on the suite's own database", () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", INTEGRATION);

    expect(() => guardIntegrationDatabase()).toThrow(/Refusing to run the integration suite/);
  });

  it("stops the run on the development database", () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", DEV);

    expect(() => guardIntegrationDatabase()).toThrow(/Refusing to run the integration suite/);
  });

  it("stops the run when nothing says where any database is", () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");

    expect(() => guardIntegrationDatabase()).toThrow(/no DATABASE_URL at all/);
  });
});
