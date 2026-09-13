/**
 * Grant or remove admin, for one account — entry point and guard.
 *
 *   DATABASE_URL=<production> npm run admin:role -- --email=someone@example.fi
 *   DATABASE_URL=<production> npm run admin:role -- --email=someone@example.fi --role=user
 *
 * This file deliberately imports nothing that touches the database. `src/db`
 * constructs its Postgres client from `process.env.DATABASE_URL` at *module
 * load*, and ES imports are hoisted, so importing it here would fix the
 * connection before the checks below had run — and the target printed on screen
 * would not necessarily be the database written to. The work lives in
 * `grant-admin-run.ts`, imported dynamically once the target is settled. The
 * same reasoning, and the same shape, as `scripts/backfill.ts`.
 *
 * **`DATABASE_URL` must come from the environment.** The one in `.env` is
 * deliberately ignored: this script exists to write to production, and picking
 * up a local default when the operator forgot to pass one is the failure worth
 * designing out — granting admin on a laptop while believing it was granted in
 * production is worse than an error message.
 */
import { parseArgs } from "./grant-admin-plan";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

// Captured before `.env` could be loaded, so `.env` cannot supply it. Blank
// counts as missing: `DATABASE_URL= npm run admin:role` otherwise passes a null
// check and fails deep inside the Postgres client, where the message says
// nothing about the variable the operator forgot to fill in.
const raw = process.env.DATABASE_URL ?? "";
const connectionString = raw.trim() === "" ? null : raw;

function usage(): void {
  err("");
  err("  DATABASE_URL=<connection string> npm run admin:role -- --email=<address>");
  err("  DATABASE_URL=<connection string> npm run admin:role -- --email=<address> --role=user");
  err("");
  err("--role defaults to admin. Use --role=user to remove admin.");
}

async function main(): Promise<void> {
  if (connectionString === null) {
    err("DATABASE_URL is not set, or is empty.");
    err("");
    err("Pass it explicitly — the value in .env is deliberately ignored here, so");
    err("that a forgotten variable cannot quietly grant admin on a local database.");
    usage();
    process.exitCode = 1;
    return;
  }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    err(parsed.message);
    usage();
    process.exitCode = 1;
    return;
  }

  // Dynamic, so the client is built only after the target is settled.
  const { setRole } = await import("./grant-admin-run");
  const result = await setRole(connectionString, parsed.request);

  if (!result.ok) {
    err(result.message);
    process.exitCode = 1;
    return;
  }
  out(result.message);
}

main().catch((error: unknown) => {
  err(String(error));
  process.exitCode = 1;
});
