import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { ensureTestDatabase } from "../tests/support/test-database";
import { executableFor, exitCodeFor, parseInvocation } from "./with-test-db-plan";

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
 *
 * The decisions here live in `with-test-db-plan.ts` and are tested there; what
 * is left is the environment, the database and the spawn. It stays behind a
 * coverage exclusion because `main()` runs at import and **creates and migrates
 * a database** — a test that imported this file would do that to whatever
 * `DATABASE_URL` the importer had (#403).
 */
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

/** `process.stderr.write` rather than `console.error`, as every other script here does. */
function fail(line: string): never {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

const invocation = parseInvocation(process.argv.slice(2));
if (!invocation.ok) {
  fail(invocation.message);
}

async function main(command: string, args: string[]): Promise<void> {
  const url = await ensureTestDatabase();

  const child = spawn(executableFor(command, process.execPath), args, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });

  child.on("exit", (code) => {
    process.exit(exitCodeFor(code));
  });
  child.on("error", (error) => {
    fail(`Could not run ${command}: ${error.message}`);
  });
}

// Narrowed above: `fail` returns `never`, so this is the parsed invocation.
void main(invocation.command, invocation.args);
