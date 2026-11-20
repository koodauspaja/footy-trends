/**
 * Makes sure the local Postgres is answering before a command that needs it
 * runs, starting the project's containers when it is not. Wired in as a `pre`
 * script; this file is wiring only.
 *
 * decisions/399-local-commands-start-the-database.md
 */
import { existsSync } from "node:fs";
import { dockerAvailable, dockerIsRunning, startContainers, startDockerDaemon } from "./docker";
import { runPreflight } from "./preflight";
import {
  decidePreflight,
  effectiveDatabaseUrl,
  runsOnComposeServer,
  waitFor,
} from "./services-plan";
import { postgresAcceptsQueries } from "./services-run";

/**
 * Docker Desktop takes its time; this is generous, not optimistic.
 *
 * decisions/399-local-commands-start-the-database.md
 */
const DAEMON_TIMEOUT_MS = 90_000;

/**
 * A first run initialises the cluster before it accepts clients.
 *
 * decisions/399-local-commands-start-the-database.md
 */
const POSTGRES_TIMEOUT_MS = 60_000;

async function main(): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  // The test entry points pass `--test`: `TEST_DATABASE_URL` may name a
  // different server. `dev` and the `db:*` commands know nothing about it.
  const url = effectiveDatabaseUrl({
    forTests: process.argv.includes("--test"),
    testUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
  });

  // An unset DATABASE_URL is not this script's problem: the guarded command has
  // its own message for it.
  if (url === "") return;

  const reachable = () => postgresAcceptsQueries(url);

  process.exitCode = await runPreflight({
    url,
    decide: () =>
      decidePreflight({
        ci: (process.env.CI ?? "") !== "",
        url,
        postgresReachable: reachable,
        targetIsLocal: runsOnComposeServer(url),
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
