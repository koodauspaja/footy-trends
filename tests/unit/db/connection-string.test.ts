import { describe, expect, it } from "vitest";
import { MISSING_DATABASE_URL, requireDatabaseUrl } from "@/db/connection-string";

/**
 * The one place that decides whether there is a database to connect to (#536).
 * Without it postgres.js falls back to `localhost` or `PGHOST`, so "missing"
 * has to be refused here and by name.
 */
describe("requireDatabaseUrl", () => {
  it("returns the connection string it was given", () => {
    const url = "postgres://user:secret@db.example.com:5432/app";

    expect(requireDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it("trims what an .env file's stray spaces leave around it", () => {
    expect(requireDatabaseUrl({ DATABASE_URL: "  postgres://db.example.com/app \n" })).toBe(
      "postgres://db.example.com/app"
    );
  });

  it.each([
    ["unset", {}],
    ["empty, as `DATABASE_URL=` in a copied .env leaves it", { DATABASE_URL: "" }],
    ["blank", { DATABASE_URL: "   " }],
  ])("refuses a variable that is %s, naming it", (_name, env) => {
    expect(() => requireDatabaseUrl(env)).toThrow(MISSING_DATABASE_URL);
    expect(MISSING_DATABASE_URL).toContain("DATABASE_URL");
  });

  it("does not take the PG* variables for an answer", () => {
    // These are what postgres.js would fall back to, and what must never
    // decide which database a migration changes.
    const env = { PGHOST: "db.example.com", PGDATABASE: "app", PGUSER: "user" };

    expect(() => requireDatabaseUrl(env)).toThrow(MISSING_DATABASE_URL);
  });

  it("reads the process's own environment when given none", () => {
    const before = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://db.example.com/from-the-process";

    try {
      expect(requireDatabaseUrl()).toBe("postgres://db.example.com/from-the-process");
    } finally {
      if (before === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = before;
    }
  });
});
