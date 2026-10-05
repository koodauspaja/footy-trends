import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MISSING_DATABASE_URL } from "@/db/connection-string";
import { warmModules } from "../../support/warm-module";

const end = vi.fn(() => Promise.resolve());
const postgresMock = vi.fn((_url: string) => ({ end }));

/** What drizzle hands back, as far as these tests need one: state, and a method that reads it. */
class FakeDatabase {
  readonly dialect = "postgres";
  select() {
    return this.dialect;
  }
}
const drizzleMock = vi.fn((_client: unknown, _options: unknown) => new FakeDatabase());

vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: drizzleMock }));

const URL = "postgres://user:secret@db.example.com:5432/app";

/** `db` as these tests use it: the stand-in, typed as the fake behind it. */
async function load() {
  const { db, closeDatabase } = await import("@/db");
  return { db: db as unknown as FakeDatabase, closeDatabase };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

warmModules(() => import("@/db"));

/**
 * The client is made when the database is first used, not when this module is
 * imported (#536): `next build` imports every route with no `DATABASE_URL` to
 * read, and a client made from nothing falls back to `localhost` or `PGHOST`.
 */
describe("the database client", () => {
  it("connects nowhere when it is only imported", async () => {
    await load();

    expect(postgresMock).not.toHaveBeenCalled();
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("can be imported with DATABASE_URL %s, as `next build` does", async (_name, value) => {
    vi.stubEnv("DATABASE_URL", value);

    await expect(load()).resolves.toBeDefined();
    expect(postgresMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])(
    "refuses the first query when DATABASE_URL is %s, naming it, and makes no client",
    async (_name, value) => {
      vi.stubEnv("DATABASE_URL", value);
      // The variables postgres.js would otherwise connect by.
      vi.stubEnv("PGHOST", "db.example.com");
      const { db } = await load();

      expect(() => db.select()).toThrow(MISSING_DATABASE_URL);
      expect(postgresMock).not.toHaveBeenCalled();
    }
  );

  it("makes one client from DATABASE_URL, however often the database is used", async () => {
    const { db } = await load();

    db.select();
    db.select();
    void db.dialect;

    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(URL);
    expect(drizzleMock).toHaveBeenCalledTimes(1);
    expect(drizzleMock).toHaveBeenCalledWith(postgresMock.mock.results[0]?.value, {
      schema: expect.any(Object),
    });
  });

  it("hands back the real client's values, and its methods bound to it", async () => {
    const { db } = await load();

    expect(db.dialect).toBe("postgres");
    // Taken off and called bare: drizzle's methods read their state from
    // `this`, so an unbound one would find none.
    const { select } = db;
    expect(select()).toBe("postgres");
  });

  it("passes for the real client to code that asks what it is", async () => {
    const { db } = await load();

    // drizzle recognises its own objects by their constructor.
    expect(db).toBeInstanceOf(FakeDatabase);
    expect("select" in db).toBe(true);
    expect("nothing-of-the-kind" in db).toBe(false);
  });
});

describe("closeDatabase", () => {
  it("closes the connection the command-line tools open", async () => {
    // Without this the backfill hangs on exit with the connection still open,
    // and `process.exit` in its place can truncate output that has not flushed.
    const { db, closeDatabase } = await load();
    db.select();

    await closeDatabase();

    expect(end).toHaveBeenCalledTimes(1);
  });

  it("has nothing to close when the database was never used", async () => {
    const { closeDatabase } = await load();

    await expect(closeDatabase()).resolves.toBeUndefined();
    expect(postgresMock).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
