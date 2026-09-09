import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { ensureTestDatabase } from "../tests/support/test-database";

/**
 * Runs a command against the **test** database, creating and migrating it first.
 *
 * From #304. The integration suite creates and deletes rows — `itest-*` users
 * among them — and used to do it in whatever `DATABASE_URL` pointed at, which
 * is normally the developer's own database. Separating them means a test run
 * cannot disturb development data, and cannot read anything development left
 * behind.
 *
 * A wrapper rather than a line in `vitest.config.ts`, because the database has
 * to exist and be migrated *before* the first test imports `@/db` — and a
 * config file cannot await that.
 */
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const [command, ...args] = process.argv.slice(2);
if (command === undefined) {
  console.error("Usage: tsx scripts/with-test-db.ts <command> [args...]");
  process.exit(1);
}

async function main(): Promise<void> {
  const url = await ensureTestDatabase();

  const child = spawn(command as string, args, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });

  child.on("exit", (code, signal) => {
    // A signalled child has no exit code; reporting 1 keeps the failure visible
    // rather than reading as success.
    process.exit(code ?? (signal === null ? 1 : 1));
  });
  child.on("error", (error) => {
    console.error(`Could not run ${command}:`, error.message);
    process.exit(1);
  });
}

void main();
