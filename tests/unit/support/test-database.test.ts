import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabaseUrl } from "../../support/test-database";

/**
 * How the test database's URL is derived, from #304.
 *
 * Worth testing on its own: it decides which database every suite writes to, so
 * getting it wrong means either the suites run against the developer's data —
 * the bug this was written to remove — or they quietly create something nobody
 * expects.
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
