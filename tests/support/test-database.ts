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
  const name = url.pathname.replace(/^\//, "");
  if (name === "") {
    throw new Error(`DATABASE_URL names no database, so no test database can be derived: ${base}`);
  }

  url.pathname = `/${name}${SUFFIX}`;
  return url.toString();
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
  const name = new URL(url).pathname.replace(/^\//, "");

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1 });
  try {
    const [existing] = await admin`select 1 from pg_database where datname = ${name}`;
    // Postgres has no `create database if not exists`, and the identifier
    // cannot be parameterised — hence the explicit quoting. The name comes from
    // our own connection string, never from user input.
    if (existing === undefined) {
      await admin.unsafe(`create database "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }

  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle/migrations" });
  } finally {
    await client.end();
  }

  return url;
}
