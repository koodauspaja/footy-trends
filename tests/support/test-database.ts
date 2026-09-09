import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * The database the test suites use, which is **not** the development one.
 *
 * From #304. Both suites used to run against whatever `DATABASE_URL` pointed
 * at, which was normally a developer's own database — and that made two
 * problems inevitable rather than unlucky:
 *
 * - **Tests inherited whatever had been synced there.** Six e2e tests passed on
 *   machines holding TASO rows written before #272 and failed everywhere else,
 *   because a completed season is never refetched and so never corrects itself.
 * - **Tests wrote into it.** The integration suite creates and deletes `itest-*`
 *   users in the same database the developer is signed into.
 *
 * A separate database removes both by construction. It is derived from
 * `DATABASE_URL` by suffixing the database name, so an existing `.env` needs no
 * edit, and `TEST_DATABASE_URL` overrides that where the derivation is wrong.
 */
const SUFFIX = "_test";

/** Names this repository's test-database migration, so two of them serialise. */
const MIGRATION_LOCK_KEY = 3_040_304;

/** `postgres://…/footy-trends` → `postgres://…/footy-trends_test`. */
export function testDatabaseUrl(): string {
  const override = process.env.TEST_DATABASE_URL;
  if (override !== undefined && override !== "") return override;

  const base = process.env.DATABASE_URL;
  if (base === undefined || base === "") {
    throw new Error(
      "Neither TEST_DATABASE_URL nor DATABASE_URL is set. The test suites need a " +
        "database — start one with `docker compose up -d` and set DATABASE_URL in .env."
    );
  }

  const url = new URL(base);
  // `pathname` is "/name"; an empty one means the connection string names no
  // database, which is not something to paper over with a default.
  //
  // The suffix is appended to the **encoded** name, so a percent-encoded one
  // stays encoded and still addresses the database it did before. Decoding here
  // and re-assigning would hand back a URL that no longer round-trips.
  const encodedName = url.pathname.replace(/^\//, "");
  if (encodedName === "") {
    throw new Error(`DATABASE_URL names no database, so no test database can be derived: ${base}`);
  }

  url.pathname = `/${encodedName}${SUFFIX}`;
  return url.toString();
}

/**
 * The database's **name**, as `create database` needs it.
 *
 * Decoded, because this is an identifier rather than a URL component:
 * `postgres://…/footy%20trends_test` connects to a database called
 * `footy trends_test`, so creating one literally named `footy%20trends_test`
 * would leave the suite connecting to something that still does not exist.
 */
export function databaseNameFor(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  /**
   * Validated here rather than only where the URL is derived, because an
   * explicit `TEST_DATABASE_URL` skips that path entirely — and an empty name
   * reaches Postgres as `create database ""`. One check, at the single place
   * the identifier is produced, is what stops the two from disagreeing.
   */
  if (name === "") {
    throw new Error(`The test database URL names no database: ${url}`);
  }
  return name;
}

/**
 * Creates the test database if it is not there, then migrates it.
 *
 * `create database` cannot run from inside the database being created, so this
 * connects to the server's default `postgres` database to issue it. The
 * database already existing is the ordinary case, not an error: this runs
 * before every suite.
 */
export async function ensureTestDatabase(): Promise<string> {
  const url = testDatabaseUrl();
  const name = databaseNameFor(url);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1 });
  try {
    const [existing] = await admin`select 1 from pg_database where datname = ${name}`;
    // Postgres has no `create database if not exists`, and the identifier
    // cannot be parameterised — hence the explicit quoting. The name comes from
    // our own connection string, never from user input.
    if (existing === undefined) {
      try {
        await admin.unsafe(`create database "${name.replace(/"/g, '""')}"`);
      } catch (error) {
        /**
         * Something else created it between the check above and this statement.
         * Two suites started together is the ordinary way that happens, and both
         * wanting the database to exist is agreement rather than conflict — so
         * the one that lost the race carries on to migrate it.
         *
         * **Two codes, measured rather than assumed.** `42P04` is
         * `duplicate_database`, raised when the loser starts after the winner
         * finished. Genuinely simultaneous statements instead surface the
         * catalog's own unique violation, `23505` on
         * `pg_database_datname_index` — which three concurrent calls reproduce
         * every time, and which a `42P04`-only catch let through.
         */
        const code = (error as { code?: string }).code;
        if (code !== "42P04" && code !== "23505") throw error;
      }
    }
  } finally {
    await admin.end();
  }

  const client = postgres(url, { max: 1 });
  try {
    /**
     * Migrating is the other half of the race, and catching `42P04` above did
     * nothing for it: both processes then arrive here and run the same
     * migrations against the same database.
     *
     * A session lock rather than a transaction one, because `migrate` opens its
     * own transactions — an `xact` lock would be released by the first of them.
     * The second process waits, then finds the migrations already applied and
     * does nothing, which is what drizzle's journal is for.
     */
    await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      await migrate(drizzle(client), { migrationsFolder: "./drizzle/migrations" });
    } finally {
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    // Ends the session, which releases the lock even if unlocking above did not
    // run — a connection cannot hold one after it is gone.
    await client.end();
  }

  return url;
}
