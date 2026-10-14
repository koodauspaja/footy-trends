import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { ensureTestDatabase } from "../tests/support/test-database";
import { executableFor, exitCodeFor, parseInvocation } from "./with-test-db-plan";

/**
 * Runs a command against the test database, creating and migrating it first.
 * A wrapper, because the database has to exist before the first test imports
 * `@/db`. Behind a coverage exclusion: importing it would do all of that.
 *
 * decisions/304-test-database.md
 * decisions/403-coverage-exclusions-that-earn-it.md
 */
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * `process.stderr.write` rather than `console.error`, as every other script here does.
 *
 * decisions/304-test-database.md
 */
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
