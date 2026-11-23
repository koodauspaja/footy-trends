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
  type PredictionCommand,
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

// What one command prints and exits with; the database is open, and `main` closes it.
async function runCommand(
  command: PredictionCommand
): Promise<{ lines: string[]; exitCode: number }> {
  const { runPredictionBacktest, runPredictionLog, settle } = await import(
    "../../src/lib/predictions/prediction-log-service"
  );
  switch (command) {
    case "refresh": {
      const { runDailyRefresh } = await import("../../src/lib/predictions/daily-refresh");
      const report = await runDailyRefresh();
      return { lines: describeDailyRefresh(report), exitCode: exitCodeFor(report) };
    }
    case "backtest":
      return {
        lines: [`Backtest     ${await runPredictionBacktest()} row(s) written`],
        exitCode: 0,
      };
    case "settle": {
      const failures: string[] = [];
      const settled = await settle(new Date(), failures);
      return {
        lines: [
          `Settled      ${settled} guess(es)`,
          ...failures.map((failure) => `Failed       ${failure}`),
        ],
        exitCode: failures.length === 0 ? 0 : 1,
      };
    }
    case "log": {
      const report = await runPredictionLog();
      return { lines: describeRun(report), exitCode: exitCodeFor(report) };
    }
  }
}

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
  try {
    const { lines, exitCode } = await runCommand(command);
    for (const line of lines) out(line);
    process.exitCode = exitCode;
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
