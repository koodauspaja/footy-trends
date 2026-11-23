/**
 * The predictions log's entry point: `npm run predictions -- log`, which the
 * Railway cron service runs hourly, `-- backtest`, run by hand after a deploy,
 * and `-- settle` and `-- refresh`, settling or the daily refresh alone. `DATABASE_URL` must come from the environment, not `.env`.
 *
 * decisions/052-predictions-log.md
 * decisions/571-bounded-database-close.md
 * decisions/072-match-guesses.md
 * decisions/080-daily-refresh-of-every-competition.md
 */
import { existsSync } from "node:fs";
import { describeError } from "../backfill/backfill-plan";
import {
  describeDailyRefresh,
  describeRun,
  exitCodeFor,
  parseCommand,
  USAGE,
} from "./predictions-plan";

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

  const { closeDatabase } = await import("../../src/db");
  const { redis } = await import("../../src/lib/platform/redis");
  const { runPredictionBacktest, runPredictionLog, settle } = await import(
    "../../src/lib/predictions/prediction-log-service"
  );
  const { runDailyRefresh } = await import("../../src/lib/predictions/daily-refresh");
  try {
    if (command === "refresh") {
      const report = await runDailyRefresh();
      for (const line of describeDailyRefresh(report)) out(line);
      process.exitCode = exitCodeFor(report);
      return;
    }
    if (command === "backtest") {
      out(`Backtest     ${await runPredictionBacktest()} row(s) written`);
      return;
    }
    if (command === "settle") {
      const failures: string[] = [];
      out(`Settled      ${await settle(new Date(), failures)} guess(es)`);
      for (const failure of failures) out(`Failed       ${failure}`);
      process.exitCode = failures.length === 0 ? 0 : 1;
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
