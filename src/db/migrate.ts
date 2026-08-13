import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// tsx does not populate process.env from .env files (see the same note in
// vitest.config.ts), so DATABASE_URL would otherwise only be set for anyone
// who exported it into their shell first.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// biome-ignore lint/style/noNonNullAssertion: required for migrations
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);
const migrationJournalPath = "./drizzle/migrations/meta/_journal.json";

async function runMigrations() {
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
