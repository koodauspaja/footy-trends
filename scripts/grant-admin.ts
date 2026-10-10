/**
 * Grant or remove admin, for one account: entry point and guard, as
 * `DATABASE_URL=<production> npm run admin:role -- --email=… [--role=user]`.
 * `DATABASE_URL` must come from the environment, not `.env`.
 *
 * decisions/371-grant-admin-script.md
 */
import { parseArgs } from "./grant-admin-plan";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

// Captured before `.env` could be loaded, so `.env` cannot supply it. Blank
// counts as missing.
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
