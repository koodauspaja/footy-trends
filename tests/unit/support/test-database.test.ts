import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseNameFor, testDatabaseUrl } from "../../support/test-database";

/**
 * How the test database's URL is derived. It decides which database every suite
 * writes to: wrong, the suites run against the developer's data or quietly
 * create something nobody expects.
 *
 * decisions/304-test-database.md
 * decisions/399-local-commands-start-the-database.md
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("testDatabaseUrl", () => {
  it("suffixes the database name, leaving everything else alone", () => {
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:secret@localhost:5432/footy-trends");

    expect(testDatabaseUrl()).toBe("postgresql://postgres:secret@localhost:5432/footy-trends_test");
  });

  it("treats a blank override as unset rather than as a URL", () => {
    // A blank `TEST_DATABASE_URL` is no override: `" "` must not reach
    // `new URL()` while the preflight has fallen back to DATABASE_URL, or the
    // two disagree about what blank means.
    vi.stubEnv("TEST_DATABASE_URL", "   ");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:secret@localhost:5432/footy-trends");

    expect(testDatabaseUrl()).toBe("postgresql://postgres:secret@localhost:5432/footy-trends_test");
  });

  it("treats a blank DATABASE_URL as unset too, not only the override", () => {
    // The same class as the override above: without this, `" "` reaches
    // `new URL()` and throws.
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL", "   ");

    expect(() => testDatabaseUrl()).toThrow(/Neither TEST_DATABASE_URL nor DATABASE_URL is set/);
  });

  it("trims a usable override rather than passing the spaces on", () => {
    vi.stubEnv("TEST_DATABASE_URL", "  postgresql://postgres:x@localhost:5432/suite  ");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:secret@localhost:5432/footy-trends");

    expect(testDatabaseUrl()).toBe("postgresql://postgres:x@localhost:5432/suite");
  });

  it("keeps a port, a password and query parameters", () => {
    // A managed Postgres hands out URLs with `sslmode` and similar attached;
    // rebuilding the string by hand rather than through `URL` is how those get
    // dropped.
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://u:p%40ss@db.example.com:6543/app?sslmode=require");

    expect(testDatabaseUrl()).toBe(
      "postgresql://u:p%40ss@db.example.com:6543/app_test?sslmode=require"
    );
  });

  it("prefers an explicit override, so the derivation can be wrong without being fatal", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@localhost:5432/footy-trends");
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://postgres@localhost:5432/somewhere-else");

    expect(testDatabaseUrl()).toBe("postgresql://postgres@localhost:5432/somewhere-else");
  });

  it("ignores an empty override rather than treating it as a URL", () => {
    // An unset variable in CI often arrives as "" rather than absent.
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@localhost:5432/footy-trends");

    expect(testDatabaseUrl()).toBe("postgresql://postgres@localhost:5432/footy-trends_test");
  });

  it("refuses a connection string that names no database", () => {
    // Appending the suffix to nothing would produce `/_test` — a database
    // nobody meant, created on the first run.
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@localhost:5432");

    expect(() => testDatabaseUrl()).toThrow(/names no database/);
  });

  it("says what to do when neither variable is set", () => {
    vi.stubEnv("TEST_DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_URL", undefined);

    expect(() => testDatabaseUrl()).toThrow(/docker compose up -d/);
  });
});

describe("databaseNameFor", () => {
  it("decodes the name, because `create database` takes an identifier", () => {
    // The URL half and the identifier half differ here. `postgres://…/footy%20trends_test`
    // connects to a database called `footy trends_test`; creating one literally named
    // `footy%20trends_test` leaves the suite connecting to something that does not exist.
    expect(databaseNameFor("postgresql://postgres@localhost:5432/footy%20trends_test")).toBe(
      "footy trends_test"
    );
  });

  it("refuses a URL that names no database, however it was arrived at", () => {
    // `testDatabaseUrl` checks the derived path, but an explicit
    // `TEST_DATABASE_URL` never goes through it — and an empty name reaches
    // Postgres as `create database ""`.
    expect(() => databaseNameFor("postgresql://postgres@localhost:5432")).toThrow(
      /names no database/
    );
  });

  it("leaves an ordinary name alone", () => {
    expect(databaseNameFor("postgresql://postgres@localhost:5432/footy-trends_test")).toBe(
      "footy-trends_test"
    );
  });
});
