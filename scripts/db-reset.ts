/**
 * Throws the local database away and builds it again: containers down with
 * their volumes, containers up, migrations applied.
 *
 * For when the local data is in a state not worth unpicking. It is the only
 * command here that destroys data on purpose, which is why it checks where it
 * is pointing before it does anything at all.
 */
import { existsSync } from "node:fs";
import { destroyContainers, dockerAvailable, dockerIsRunning, startContainers } from "./docker";
import { postgresUnreachableMessage, resetRefusal } from "./services-plan";
import { postgresAcceptsQueries, run, waitFor } from "./services-run";

const POSTGRES_TIMEOUT_MS = 60_000;

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

function fail(message: string): never {
  err(`\n${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const url = process.env.DATABASE_URL;

  /**
   * The guard comes first, before Docker is even looked for.
   *
   * A refusal has to be the first thing that happens, not something reached
   * after a probe that might itself fail and change the path — the point is
   * that there is no sequence of events in which this deletes a volume it was
   * not pointed at.
   */
  const refusal = resetRefusal(url);
  if (refusal !== null) fail(refusal);

  if (!dockerAvailable() || !dockerIsRunning()) {
    fail("Docker is not running, so there are no containers to reset. Start it and try again.");
  }

  out("Removing the containers and their volumes…");
  if (!destroyContainers()) fail("`docker compose down --volumes` failed. Its output is above.");

  out("Starting them again…");
  if (!startContainers()) fail("`docker compose up -d` failed. Its output is above.");

  // `url` is a string by here: `resetRefusal` returns a message for undefined
  // and empty, and that path has already exited.
  const target = url as string;

  const ready = await waitFor(() => postgresAcceptsQueries(target), POSTGRES_TIMEOUT_MS);
  if (!ready.ok) fail(postgresUnreachableMessage(ready.waitedMs, target));

  out("Applying migrations…");
  /**
   * `node` means *this* Node, and tsx is reached by its `.mjs` entry rather
   * than through `node_modules/.bin`. npm exposes that as a shell script here
   * and a `.cmd` shim on Windows, neither of which `spawn` can run without a
   * shell — the trap `scripts/executable.ts` and `with-test-db.ts` both
   * document.
   */
  const code = await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"]);
  if (code !== 0) fail("Migrations failed. Their output is above.");

  out("");
  out("The local database is fresh and migrated.");
}

void main();
