import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireDatabaseUrl } from "./connection-string";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let database: Database | undefined;

/**
 * The real client, made the first time the database is used, not when this
 * module is imported. `DATABASE_URL` is required at that first query.
 *
 * decisions/536-database-url-required.md
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
 * caller keeps importing `db` as a value. Only a method from the prototype is
 * handed back bound to the real client.
 *
 * decisions/536-database-url-required.md
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = connected();
    const value: unknown = Reflect.get(real, property, real);
    const isMethod =
      typeof value === "function" && property !== "constructor" && !Object.hasOwn(real, property);
    return isMethod ? value.bind(real) : value;
  },
  has(_target, property) {
    return Reflect.has(connected(), property);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(connected());
  },
});

/**
 * The transaction handle drizzle hands `db.transaction`.
 *
 * decisions/026-favourites.md
 * decisions/028-admin-tools-and-roles.md
 * decisions/532-one-transaction-type-one-round-dropdown.md
 */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The database, or a transaction on it. Writers take this and never reach for
 * the module-level `db`, so a write joins the transaction its caller opened.
 *
 * decisions/029-forced-season-refresh.md
 */
export type Executor = typeof db | Transaction;

/**
 * How long a close may take before the driver drops what is left.
 *
 * decisions/571-bounded-database-close.md
 */
export const CLOSE_TIMEOUT_SECONDS = 2;

/**
 * Exported for command-line tools only: the server never closes this. Nothing
 * to close when the database was never used. The close is bounded, because the
 * driver's own never settles for a connection that failed while it was opening.
 *
 * decisions/169-production-backfill.md
 * decisions/536-database-url-required.md
 * decisions/571-bounded-database-close.md
 */
export const closeDatabase = async (): Promise<void> => {
  await client?.end({ timeout: CLOSE_TIMEOUT_SECONDS });
};
