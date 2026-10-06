/**
 * The two resets, and which one you get: `npm run db:reset` drops the suites'
 * database; `npm run db:reset:dev --` destroys the developer's, with the
 * compose volume, and asks first. Wiring only.
 *
 * decisions/399-local-commands-start-the-database.md
 * decisions/406-safe-and-destructive-resets.md
 */
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { testDatabaseUrl } from "../tests/support/test-database";
import { type ConfirmationOutcome, runReset, runTestReset } from "./db-reset-steps";
import { destroyContainers, dockerAvailable, dockerIsRunning, startContainers } from "./docker";
import { confirmationPrompt, decideConfirmation, isAffirmative, waitFor } from "./services-plan";
import { dropDatabase, postgresAcceptsQueries, run } from "./services-run";

const POSTGRES_TIMEOUT_MS = 60_000;

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`\n${line}\n`);
}

/**
 * Asks, unless `--yes` said not to or there is nobody to ask.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
async function confirm(yes: boolean): Promise<ConfirmationOutcome> {
  const decision = decideConfirmation({ yes, interactive: process.stdin.isTTY === true });
  if (decision === "proceed") return "proceed";
  if (decision === "refuse") return "refused";

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return isAffirmative(await rl.question(confirmationPrompt())) ? "proceed" : "declined";
  } finally {
    rl.close();
  }
}

/**
 * The suites' database, or `undefined` when nothing says where it is.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
function suiteDatabaseUrl(): string | undefined {
  try {
    return testDatabaseUrl();
  } catch {
    // It throws when neither variable is set, which `testResetRefusal` reports
    // better than a stack trace would.
    return undefined;
  }
}

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const args = new Set(process.argv.slice(2));

  if (!args.has("--dev")) {
    process.exitCode = await runTestReset({
      url: suiteDatabaseUrl(),
      dropDatabase,
      out,
      err,
    });
    return;
  }

  const yes = args.has("--yes");

  process.exitCode = await runReset({
    url: process.env.DATABASE_URL,
    confirm: () => confirm(yes),
    dockerAvailable: () => dockerAvailable(),
    dockerIsRunning: () => dockerIsRunning(),
    destroyContainers: () => destroyContainers(),
    startContainers: () => startContainers(),
    postgresReachable: postgresAcceptsQueries,
    wait: waitFor,
    // `node` means this Node, and tsx is reached by its `.mjs` entry: `spawn`
    // cannot run the `node_modules/.bin` shim without a shell.
    migrate: () => run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"]),
    postgresTimeoutMs: POSTGRES_TIMEOUT_MS,
    out,
    err,
  });
}

void main();
