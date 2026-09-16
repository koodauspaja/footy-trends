/**
 * The parts of the services preflight that touch Postgres and the clock.
 * `services-plan.ts` decides what the answers mean, `docker.ts` does the
 * container side, and this only gathers and waits.
 *
 * Not unit tested, and listed in `sonar.coverage.exclusions` for the same
 * reason the other runners are: a test of a socket asserts against whatever
 * this machine happens to be running.
 */
import { spawn } from "node:child_process";
import postgres from "postgres";
import { databaseNameOf, probeUrls } from "./services-plan";

/** How long a single probe waits before calling the server unreachable. */
const PROBE_TIMEOUT_SECONDS = 2;

/**
 * Whether a Postgres on that URL will answer a query — not merely whether
 * something holds the port open.
 *
 * A TCP connect would be cheaper and is what the first draft did, but it says
 * yes the moment the container binds, which is before the server accepts
 * clients on a first run. Asking for `select 1` is the difference between "the
 * port is open" and "you can migrate now".
 *
 * **Connects to `postgres`, not to the application's database.** That one
 * always exists, so a refusal means the server is not up rather than that the
 * database has not been created yet — two states with very different fixes.
 */
export async function postgresAcceptsQueries(url: string): Promise<boolean> {
  for (const candidate of probeUrls(url)) {
    if (await answers(candidate)) return true;
  }
  return false;
}

/** One connection attempt, to exactly the database this URL names. */
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

/** Runs a command to completion, inheriting stdio, and resolves its exit code. */
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
 * Drops the database a URL names, connecting to the server's own `postgres`
 * database to do it — `drop database` cannot run from inside the database being
 * dropped.
 *
 * `with (force)` because the suites' database routinely has connections left
 * open by a run that was interrupted, and without it the drop fails with
 * "database is being accessed by other users" — which is true, and not a reason
 * to keep a database nobody wants.
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
