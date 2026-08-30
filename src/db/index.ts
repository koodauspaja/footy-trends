import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// biome-ignore lint/style/noNonNullAssertion: app must not start without DATABASE_URL
const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });

/**
 * Exported for command-line tools only. The server never closes this — it lives
 * for the process — but a script that does not close it hangs on exit with the
 * connection still open, and `process.exit` in its place can truncate output
 * that has not been flushed.
 */
export const closeDatabase = (): Promise<void> => client.end();
