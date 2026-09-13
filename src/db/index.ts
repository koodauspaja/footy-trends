import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// biome-ignore lint/style/noNonNullAssertion: app must not start without DATABASE_URL
const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });

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
 */
export const closeDatabase = (): Promise<void> => client.end();
