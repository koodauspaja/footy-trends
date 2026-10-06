/**
 * The predictions log's entry point (specs/052): the Railway cron service runs
 * `npm run predictions -- log` hourly in production (S1, S11, S12), and the
 * backtest is run by hand after deploy (S10).
 *
 *   DATABASE_URL=<target> npm run predictions -- log
 *   DATABASE_URL=<target> npm run predictions -- backtest
 *
 * `DATABASE_URL` must come from the environment; the one in `.env` is ignored,
 * as `backfill.ts` ignores it, so a forgotten variable cannot write
 * predictions into a development database. Nothing touching the database is
 * imported until the target is settled: `src/db` reads the variable when it
 * is first used.
 */
import { existsSync } from "node:fs";
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
      if (result.status === "rejected") err(`cleanup: ${String(result.reason)}`);
    }
  }
}

main().catch((error: unknown) => {
  err(`Predictions failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
