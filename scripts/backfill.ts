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
import { authoriseReset, describeTarget } from "./backfill-plan";

const out = (line = ""): void => void process.stdout.write(`${line}\n`);
const err = (line = ""): void => void process.stderr.write(`${line}\n`);

// Captured before `.env` is loaded, so `.env` cannot supply it.
const connectionString = process.env.DATABASE_URL ?? null;

// Loaded only for the provider keys, which are read lazily at request time and
// so are unaffected by import hoisting.
if (existsSync(".env")) process.loadEnvFile(".env");

async function main(): Promise<void> {
  if (connectionString === null) {
    err("DATABASE_URL is not set in the environment.");
    err("");
    err("Pass it explicitly — the value in .env is deliberately ignored here,");
    err("so that a forgotten variable cannot quietly backfill a local database:");
    err("  DATABASE_URL=<production> npm run backfill");
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

void main();
