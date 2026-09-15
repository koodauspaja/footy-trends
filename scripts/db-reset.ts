/**
 * Throws the local database away and builds it again: containers down with
 * their volumes, containers up, migrations applied.
 *
 * For when the local data is in a state not worth unpicking.
 *
 * Wiring only. The sequence, and every refusal in it, lives in
 * `db-reset-steps.ts` where it is unit tested; this reads the environment and
 * hands the actions over. It stays uncovered because `void main()` at import
 * means a test that imported it would reset the importer's database.
 */
import { existsSync } from "node:fs";
import { runReset } from "./db-reset-steps";
import { destroyContainers, dockerAvailable, dockerIsRunning, startContainers } from "./docker";
import { waitFor } from "./services-plan";
import { postgresAcceptsQueries, run } from "./services-run";

const POSTGRES_TIMEOUT_MS = 60_000;

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  process.exitCode = await runReset({
    url: process.env.DATABASE_URL,
    dockerAvailable: () => dockerAvailable(),
    dockerIsRunning: () => dockerIsRunning(),
    destroyContainers: () => destroyContainers(),
    startContainers: () => startContainers(),
    postgresReachable: postgresAcceptsQueries,
    wait: waitFor,
    /**
     * `node` means *this* Node, and tsx is reached by its `.mjs` entry rather
     * than through `node_modules/.bin`. npm exposes that as a shell script here
     * and a `.cmd` shim on Windows, neither of which `spawn` can run without a
     * shell — the trap `scripts/executable.ts` and `with-test-db.ts` document.
     */
    migrate: () => run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"]),
    postgresTimeoutMs: POSTGRES_TIMEOUT_MS,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`\n${line}\n`),
  });
}

void main();
