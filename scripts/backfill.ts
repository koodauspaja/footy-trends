/**
 * One-shot backfill of the production database — entry point and guard.
 *
 * This file deliberately imports nothing that touches the database. `src/db`
 * constructs its Postgres client from `process.env.DATABASE_URL` at *module
 * load*, and ES imports are hoisted, so importing it here would fix the
 * connection before any of the checks below had run — and the target printed on
 * screen would not necessarily be the database written to. The real work lives
 * in `backfill-run.ts`, imported dynamically once the target is settled.
 *
 *   DATABASE_URL=<production> npm run backfill
 *   DATABASE_URL=<production> npm run backfill -- --reset=<database-name>
 *
 * `DATABASE_URL` must come from the environment. The one in `.env` is
 * deliberately ignored: this script exists to write to production, and picking
 * up a local default when the operator forgot to pass one is the failure worth
 * designing out.
 */
import { existsSync } from "node:fs";
import { authoriseReset, databaseNameFrom, describeTarget } from "./backfill-plan";

const out = (line = ""): void => void process.stdout.write(`${line}\n`);
const err = (line = ""): void => void process.stderr.write(`${line}\n`);

// Captured before `.env` is loaded, so `.env` cannot supply it. Blank counts as
// missing: `DATABASE_URL= npm run backfill` otherwise passes a null check and
// then fails deep inside the Postgres client, where the message says nothing
// about the variable the operator forgot to fill in.
const rawConnectionString = process.env.DATABASE_URL ?? "";
const connectionString = rawConnectionString.trim() === "" ? null : rawConnectionString;

// Loaded only for the provider keys, which are read lazily at request time and
// so are unaffected by import hoisting.
if (existsSync(".env")) process.loadEnvFile(".env");

async function main(): Promise<void> {
  if (connectionString === null) {
    err("DATABASE_URL is not set, or is empty.");
    err("");
    err("Pass it explicitly — the value in .env is deliberately ignored here,");
    err("so that a forgotten variable cannot quietly backfill a local database:");
    err("  DATABASE_URL=<production> npm run backfill");
    process.exitCode = 1;
    return;
  }
  // A connection string with no database name is refused rather than tried.
  // Postgres would default the database to the username and the script would
  // sit waiting on a connection, and `--reset` could never be confirmed against
  // a name that is not there. Better to say so before anything connects.
  if (databaseNameFrom(connectionString) === null) {
    err(`DATABASE_URL names no database: ${describeTarget(connectionString)}`);
    err("Include the database in the connection string, e.g. .../railway");
    process.exitCode = 1;
    return;
  }

  // `src/db` reads DATABASE_URL at load; restore it for the dynamic import.
  process.env.DATABASE_URL = connectionString;

  const args = process.argv.slice(2);
  const resetArg = args.find((a) => a === "--reset" || a.startsWith("--reset="));
  const confirmedName = resetArg?.includes("=") ? (resetArg.split("=")[1] ?? null) : null;

  out(`Target       ${describeTarget(connectionString)}`);

  if (resetArg !== undefined) {
    const verdict = authoriseReset(connectionString, confirmedName);
    if (!verdict.allowed) {
      err(`\nRefusing to reset: ${verdict.reason}`);
      process.exitCode = 1;
      return;
    }
  }

  const { backfill } = await import("./backfill-run");
  process.exitCode = await backfill({ reset: resetArg !== undefined });
}

// A rejection here — an unusable connection string surfacing while `src/db`
// builds its client, most likely — would otherwise be an unhandled rejection:
// a stack trace, and an exit code that says nothing about what to fix.
main().catch((error: unknown) => {
  err(`\nBackfill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
