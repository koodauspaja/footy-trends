/**
 * The two resets, and which one you get: `npm run db:reset` drops the suites'
 * databases; `npm run db:reset:dev --` destroys the developer's, with the
 * compose volume, and asks first. Wiring only.
 *
 * decisions/399-local-commands-start-the-database.md
 * decisions/406-safe-and-destructive-resets.md
 * decisions/674-e2e-on-an-empty-database.md
 */
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { integrationDatabaseUrl, testDatabaseUrl } from "../tests/support/test-database";
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
 * One of the suites' databases, or `undefined` when nothing says where it is.
 *
 * decisions/406-safe-and-destructive-resets.md
 * decisions/674-e2e-on-an-empty-database.md
 */
function suiteDatabaseUrl(derive: () => string): string | undefined {
  const configured = [process.env.TEST_DATABASE_URL, process.env.DATABASE_URL].some(
    (value) => (value ?? "").trim() !== ""
  );
  // Neither set: `testResetRefusal` says so better than the derivation would.
  // Anything else it refuses, it says itself.
  return configured ? derive() : undefined;
}

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const args = new Set(process.argv.slice(2));

  if (!args.has("--dev")) {
    // The e2e suite's database, then the integration suite's own.
    for (const derive of [testDatabaseUrl, integrationDatabaseUrl]) {
      const code = await runTestReset({ url: suiteDatabaseUrl(derive), dropDatabase, out, err });
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
    }
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

main().catch((error: unknown) => {
  // The derivations' messages name a host at most, never a password.
  err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
