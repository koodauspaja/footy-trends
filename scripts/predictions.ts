/**
 * The predictions log's entry point: `npm run predictions -- log`, which the
 * Railway cron service runs hourly, and `-- backtest`, run by hand after a
 * deploy. `DATABASE_URL` must come from the environment, not `.env`.
 *
 * decisions/052-predictions-log.md
 * decisions/571-bounded-database-close.md
 */
import { existsSync } from "node:fs";
import { describeError } from "./backfill-plan";
import { describeRun, exitCodeFor, parseCommand, USAGE } from "./predictions-plan";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

// Captured before `.env` is loaded, so `.env` cannot supply it.
const rawConnectionString = process.env.DATABASE_URL ?? "";
const connectionString = rawConnectionString.trim() === "" ? null : rawConnectionString;

// Loaded only for the provider keys, read lazily at request time.
if (existsSync(".env")) process.loadEnvFile(".env");

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  if (command === null) {
    for (const line of USAGE) err(line);
    process.exitCode = 2;
    return;
  }
  if (connectionString === null) {
    err("DATABASE_URL is not set, or is empty. The value in .env is deliberately ignored.");
    process.exitCode = 1;
    return;
  }
  process.env.DATABASE_URL = connectionString;

  const { closeDatabase } = await import("../src/db");
  const { redis } = await import("../src/lib/redis");
  const { runPredictionBacktest, runPredictionLog } = await import(
    "../src/lib/prediction-log-service"
  );
  try {
    if (command === "backtest") {
      out(`Backtest     ${await runPredictionBacktest()} row(s) written`);
      return;
    }
    const report = await runPredictionLog();
    for (const line of describeRun(report)) out(line);
    process.exitCode = exitCodeFor(report);
  } finally {
    // Cleanup cannot decide whether the run succeeded.
    for (const result of await Promise.allSettled([closeDatabase(), redis.quit()])) {
      if (result.status === "rejected") err(`cleanup: ${describeError(result.reason)}`);
    }
  }
}

main().catch((error: unknown) => {
  err(`Predictions failed: ${describeError(error)}`);
  process.exitCode = 1;
});
