/**
 * One-shot backfill of the production database: entry point and guard, as
 * `DATABASE_URL=<production> npm run backfill`. It imports nothing that
 * touches the database, and ignores the `DATABASE_URL` in `.env`.
 *
 * decisions/036-halftime-comebacks.md
 * decisions/169-production-backfill.md
 */
import { existsSync } from "node:fs";
import { authoriseReset, databaseNameFrom, describeTarget } from "./backfill-plan";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

// Captured before `.env` is loaded, so `.env` cannot supply it. Blank counts as
// missing.
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
  // A connection string with no database name is refused, not tried.
  if (databaseNameFrom(connectionString) === null) {
    err(`DATABASE_URL names no database: ${describeTarget(connectionString)}`);
    err("Include the database in the connection string, e.g. .../railway");
    process.exitCode = 1;
    return;
  }

  // `src/db` reads DATABASE_URL on first use; restore it before the work loads.
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
  // `--refetch` fetches competition-seasons that are already stored, which the
  // run otherwise skips. Opt-in: it costs a full run's provider quota.
  const refetch = args.includes("--refetch");

  process.exitCode = await backfill({ reset: resetArg !== undefined, refetch });
}

// A rejection here — an unusable connection string surfacing while `src/db`
// builds its client, most likely — would otherwise be an unhandled rejection:
// a stack trace, and an exit code that says nothing about what to fix.
main().catch((error: unknown) => {
  err(`\nBackfill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
