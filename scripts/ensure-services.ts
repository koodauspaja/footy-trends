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
 * fix.
 *
 * This file is wiring only. The decision lives in `services-plan.ts` and the
 * sequence in `preflight.ts`, both unit tested; what is left here is reading the
 * environment and handing the pieces over. It stays uncovered because
 * `void main()` at import means a test that imported it would run it.
 */
import { existsSync } from "node:fs";
import { dockerAvailable, dockerIsRunning, startContainers, startDockerDaemon } from "./docker";
import { runPreflight } from "./preflight";
import {
  decidePreflight,
  effectiveDatabaseUrl,
  namesComposeDatabase,
  waitFor,
} from "./services-plan";
import { postgresAcceptsQueries } from "./services-run";

/** Docker Desktop takes its time; this is generous rather than optimistic. */
const DAEMON_TIMEOUT_MS = 90_000;

/** A first run initialises the cluster before it accepts clients. */
const POSTGRES_TIMEOUT_MS = 60_000;

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  /**
   * The test entry points pass `--test`, because `TEST_DATABASE_URL` overrides
   * the derivation the suites use and may name a different server; `dev` and
   * the `db:*` commands know nothing about it.
   */
  const url = effectiveDatabaseUrl({
    forTests: process.argv.includes("--test"),
    testUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
  });

  /**
   * An unset DATABASE_URL is not this script's problem to solve.
   *
   * The command being guarded has its own message for it — `testDatabaseUrl()`
   * names both variables and says to start the containers — and a second
   * opinion here would only get in front of a better one.
   */
  if (url === "") return;

  const reachable = () => postgresAcceptsQueries(url);

  process.exitCode = await runPreflight({
    url,
    decide: () =>
      decidePreflight({
        ci: (process.env.CI ?? "") !== "",
        url,
        postgresReachable: reachable,
        targetIsLocal: namesComposeDatabase(url),
        dockerAvailable,
        dockerRunning: dockerIsRunning,
      }),
    startDaemon: () => startDockerDaemon(),
    dockerIsRunning: () => dockerIsRunning(),
    startContainers: () => startContainers(),
    postgresReachable: reachable,
    wait: waitFor,
    daemonTimeoutMs: DAEMON_TIMEOUT_MS,
    postgresTimeoutMs: POSTGRES_TIMEOUT_MS,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`\n${line}\n`),
  });
}

void main();
