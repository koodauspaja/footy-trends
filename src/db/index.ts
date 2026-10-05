import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireDatabaseUrl } from "./connection-string";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let database: Database | undefined;

/**
 * The real client, made the first time the database is used.
 *
 * **Not when this module is imported** (#536). `next build` imports every
 * route, and `DATABASE_URL` is not there to read at build time; a check at
 * import would fail the build, and no check at all let postgres.js fall back to
 * `localhost` or `PGHOST` (see `connection-string.ts`). So the variable is
 * required at the first query, which is the first moment it is needed.
 */
function connected(): Database {
  if (database === undefined) {
    client = postgres(requireDatabaseUrl());
    database = drizzle(client, { schema });
  }
  return database;
}

/**
 * The database. A stand-in that becomes the real client on first use, so every
 * caller keeps importing `db` as a value.
 *
 * A method is handed back bound to the real client, because drizzle's methods
 * read their own state from `this`. The prototype is the real one's as well:
 * drizzle recognises its own objects by their constructor.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = connected();
    const value: unknown = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, property) {
    return Reflect.has(connected(), property);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(connected());
  },
});

/**
 * The database, or a transaction on it.
 *
 * Writers take this rather than reaching for the module-level `db`, so a caller
 * that has opened a transaction can pass it in and have the write actually join
 * it. Without the parameter a writer silently commits on its own connection
 * while its caller believes it is inside a transaction — which is exactly what
 * `force-refresh.ts` believed, and did not have, until review said so. See
 * specs/029-forced-season-refresh.md.
 */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Exported for command-line tools only. The server never closes this — it lives
 * for the process — but a script that does not close it hangs on exit with the
 * connection still open, and `process.exit` in its place can truncate output
 * that has not been flushed.
 *
 * Nothing to close when the database was never used.
 */
export const closeDatabase = async (): Promise<void> => {
  await client?.end();
};
