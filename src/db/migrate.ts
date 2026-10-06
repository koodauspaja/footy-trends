import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { requireDatabaseUrl } from "./connection-string";

// tsx does not populate process.env from .env files (see the same note in
// vitest.config.ts), so DATABASE_URL would otherwise only be set for anyone
// who exported it into their shell first.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const migrationJournalPath = "./drizzle/migrations/meta/_journal.json";

/**
 * The connection string, or `null` after saying why there is none.
 *
 * Checked before any client exists (#536): handed nothing, postgres.js would
 * migrate `localhost` or whatever `PGHOST` names. One line on stderr and a
 * non-zero exit, where an uncaught error would bury the variable's name under
 * a stack trace in the deploy log.
 */
function connectionString(): string | null {
  try {
    return requireDatabaseUrl();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return null;
  }
}

async function runMigrations() {
  const url = connectionString();
  if (url === null) return;

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  try {
    try {
      await access(migrationJournalPath);
    } catch {
      // No generated migrations yet; skip cleanly.
      return;
    }

    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  } finally {
    await client.end();
  }
}

void runMigrations();
