/**
 * Makes sure the local Postgres is answering before a command that needs it
 * runs, starting the project's containers when it is not.
 *
 * Wired in as a `pre` script on every local entry point that needs the
 * database — `dev`, the `db:*` commands and both test suites. npm runs
 * `pre<name>` before `<name>` for any script, including colon-named ones, so
 * nothing here has to wrap or re-spawn the command it guards.
 *
 * **Why this exists.** `tests/e2e/global-setup.ts` already fails fast with the
 * line that fixes it for a missing FOOTBALL_DATA_API_KEY and a missing
 * TASO_API_KEY. Postgres was the third prerequisite and got nothing: with the
 * containers down the run died inside the driver with a bare `AggregateError`
 * at `tests/support/test-database.ts:94`, which names neither the cause nor the
 * fix. This finishes that pattern, and starts the containers rather than only
 * complaining about them.
 */
import { existsSync } from "node:fs";
import { dockerAvailable, dockerIsRunning, startContainers, startDockerDaemon } from "./docker";
import {
  daemonUnavailableMessage,
  decidePreflight,
  postgresUnreachableMessage,
} from "./services-plan";
import { postgresAcceptsQueries, waitFor } from "./services-run";

/** Docker Desktop takes its time; this is generous rather than optimistic. */
const DAEMON_TIMEOUT_MS = 90_000;

/** A first run initialises the cluster before it accepts clients. */
const POSTGRES_TIMEOUT_MS = 60_000;

/** `process.stdout.write` rather than `console`, as every other script here does. */
function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

function fail(message: string): void {
  err(`\n${message}\n`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const url = process.env.DATABASE_URL ?? "";

  /**
   * An unset DATABASE_URL is not this script's problem to solve.
   *
   * The command being guarded has its own message for it — `testDatabaseUrl()`
   * names both variables and says to start the containers — and a second
   * opinion here would only get in front of a better one.
   */
  if (url.trim() === "") return;

  const decision = await decidePreflight({
    ci: (process.env.CI ?? "") !== "",
    postgresReachable: () => postgresAcceptsQueries(url),
    dockerAvailable,
    dockerRunning: dockerIsRunning,
  });

  if (decision.kind === "ready") return;

  if (decision.kind === "skip") {
    out(decision.message);
    return;
  }

  if (decision.kind === "no-docker") {
    fail(decision.message);
    return;
  }

  if (decision.kind === "start-daemon") {
    out("The Docker daemon is not running. Starting it…");
    startDockerDaemon();

    const daemon = await waitFor(async () => dockerIsRunning(), DAEMON_TIMEOUT_MS);
    if (!daemon.ok) {
      fail(daemonUnavailableMessage(daemon.waitedMs));
      return;
    }
  }

  out("Starting the project's containers…");
  if (!startContainers()) {
    fail("`docker compose up -d` failed. Its output is above.");
    return;
  }

  const postgres = await waitFor(() => postgresAcceptsQueries(url), POSTGRES_TIMEOUT_MS);
  if (!postgres.ok) {
    fail(postgresUnreachableMessage(postgres.waitedMs, url));
    return;
  }

  out("Postgres is ready.");
}

void main();
