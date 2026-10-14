import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * The database the test suites use, which is not the development one: derived
 * from `DATABASE_URL` by suffixing the database name, unless
 * `TEST_DATABASE_URL` says otherwise.
 *
 * decisions/304-test-database.md
 * decisions/399-local-commands-start-the-database.md
 */

const SUFFIX = "_test";

/**
 * Names this repository's test-database migration, so two of them serialise.
 *
 * decisions/304-test-database.md
 */
const MIGRATION_LOCK_KEY = 3_040_304;

/**
 * `postgres://…/footy-trends` → `postgres://…/footy-trends_test`.
 *
 * decisions/304-test-database.md
 * decisions/399-local-commands-start-the-database.md
 */
export function testDatabaseUrl(): string {
  // Blank counts as unset, trimmed: the rule the preflight's
  // `effectiveDatabaseUrl` applies to this variable.
  const override = (process.env.TEST_DATABASE_URL ?? "").trim();
  if (override !== "") return override;

  // Trimmed, as the override is: a blank value would reach `new URL()`, which
  // throws.
  const base = (process.env.DATABASE_URL ?? "").trim();
  if (base === "") {
    throw new Error(
      "Neither TEST_DATABASE_URL nor DATABASE_URL is set. The test suites need a " +
        "database — start one with `docker compose up -d` and set DATABASE_URL in .env."
    );
  }

  const url = new URL(base);
  // `pathname` is "/name"; an empty one names no database. The suffix is
  // appended to the encoded name, so the URL still round-trips.
  const encodedName = url.pathname.replace(/^\//, "");
  if (encodedName === "") {
    throw new Error(`DATABASE_URL names no database, so no test database can be derived: ${base}`);
  }

  url.pathname = `/${encodedName}${SUFFIX}`;
  return url.toString();
}

/**
 * The database's name, as `create database` needs it: decoded, because it is
 * an identifier, not a URL component.
 *
 * decisions/304-test-database.md
 */
export function databaseNameFor(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  // Validated here, where the identifier is produced: an explicit
  // `TEST_DATABASE_URL` skips the derivation.
  if (name === "") {
    throw new Error(`The test database URL names no database: ${url}`);
  }
  return name;
}

/**
 * Creates the test database if it is not there, then migrates it. Issued from
 * the server's `postgres` database: `create database` cannot run inside the
 * one being created. It already existing is the ordinary case.
 *
 * decisions/304-test-database.md
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
        await admin.unsafe(`create database "${name.replaceAll('"', '""')}"`);
      } catch (error) {
        // Something else created it between the check and this statement. Two codes:
        // `42P04` when the loser starts after the winner finished, `23505` when the
        // statements are genuinely simultaneous.
        const code = (error as { code?: string }).code;
        if (code !== "42P04" && code !== "23505") throw error;
      }
    }
  } finally {
    await admin.end();
  }

  const client = postgres(url, { max: 1 });
  try {
    // Migrating is the other half of the race. A session lock, not a transaction
    // one, because `migrate` opens its own transactions. The second process waits,
    // then finds the migrations applied and does nothing.
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
