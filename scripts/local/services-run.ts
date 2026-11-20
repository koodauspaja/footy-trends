/**
 * The parts of the services preflight that touch Postgres and the clock: this
 * only gathers and waits. Not unit tested: a test of a socket asserts against
 * whatever this machine happens to be running.
 *
 * decisions/399-local-commands-start-the-database.md
 * decisions/406-safe-and-destructive-resets.md
 */
import { spawn } from "node:child_process";
import postgres from "postgres";
import { databaseNameOf, probeUrls } from "./services-plan";

/**
 * How long a single probe waits before calling the server unreachable.
 *
 * decisions/399-local-commands-start-the-database.md
 */
const PROBE_TIMEOUT_SECONDS = 2;

/**
 * Whether a Postgres on that URL will answer a query, not merely whether
 * something holds the port open.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export async function postgresAcceptsQueries(url: string): Promise<boolean> {
  for (const candidate of probeUrls(url)) {
    if (await answers(candidate)) return true;
  }
  return false;
}

/**
 * One connection attempt, to exactly the database this URL names.
 *
 * decisions/399-local-commands-start-the-database.md
 */
async function answers(url: string): Promise<boolean> {
  const sql = postgres(url, {
    max: 1,
    connect_timeout: PROBE_TIMEOUT_SECONDS,
    idle_timeout: 1,
    // A probe that printed the server's notices would put noise in front of
    // every `npm run dev`.
    onnotice: () => {},
  });

  try {
    await sql`select 1`;
    return true;
  } catch {
    // Refused, timed out, wrong password, no such database — all of them mean
    // this candidate cannot answer, and the caller's message covers the ones
    // worth naming.
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

/**
 * Runs a command to completion, inheriting stdio, and resolves its exit code.
 *
 * decisions/399-local-commands-start-the-database.md
 */
export function run(command: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: "inherit" });
    // A signalled child has no exit code; 1 keeps the failure visible rather
    // than letting it read as success — the same choice `with-test-db.ts` makes.
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

/**
 * Drops the database a URL names, from the server's own `postgres` database
 * and `with (force)`.
 *
 * decisions/406-safe-and-destructive-resets.md
 */
export async function dropDatabase(url: string): Promise<boolean> {
  const name = databaseNameOf(url);
  if (name === null || name === "") return false;

  const admin = new URL(url);
  admin.pathname = "/postgres";

  const sql = postgres(admin.toString(), {
    max: 1,
    connect_timeout: PROBE_TIMEOUT_SECONDS,
    idle_timeout: 1,
    onnotice: () => {},
  });

  try {
    // The identifier cannot be parameterised, hence the explicit quoting. The
    // name comes from our own connection string, never from user input — the
    // same reasoning `tests/support/test-database.ts` documents for `create`.
    await sql.unsafe(`drop database if exists "${name.replaceAll('"', '""')}" with (force)`);
    return true;
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
