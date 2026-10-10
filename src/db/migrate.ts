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
 * The connection string, or `null` after saying why there is none: one line on
 * stderr, before any client exists.
 *
 * decisions/536-database-url-required.md
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
