/**
 * The predictions runner's decisions, apart from its I/O:
 * `predictions.ts` connects and runs; what it runs, what it prints and how it
 * exits is decided here, where it can be tested.
 *
 * decisions/052-predictions-log.md
 * decisions/072-match-guesses.md
 * decisions/080-daily-refresh-of-every-competition.md
 */

import type { DailyRefreshReport } from "../../src/lib/predictions/daily-refresh";
import type { PredictionRunReport } from "../../src/lib/predictions/prediction-log-service";

export type PredictionCommand = "log" | "backtest" | "settle" | "refresh";

export const USAGE = [
  "Usage:",
  "  DATABASE_URL=<target> npm run predictions -- log       the hourly run (specs/052, S1)",
  "  DATABASE_URL=<target> npm run predictions -- backtest  backtest rows (S10)",
  "  DATABASE_URL=<target> npm run predictions -- settle    settle Arvauspeli guesses (specs/072)",
  "  DATABASE_URL=<target> npm run predictions -- refresh   every competition's current season (specs/080)",
];

const COMMANDS: readonly PredictionCommand[] = ["log", "backtest", "settle", "refresh"];

/**
 * The command asked for, or null for anything else.
 *
 * decisions/052-predictions-log.md
 */
export function parseCommand(args: readonly string[]): PredictionCommand | null {
  if (args.length !== 1) return null;
  const command = COMMANDS.find((known) => known === args[0]);
  return command ?? null;
}

/**
 * The run's summary, one line per fact and per failure.
 *
 * decisions/052-predictions-log.md
 * decisions/057-surprise-index.md
 */
export function describeRun(report: PredictionRunReport): string[] {
  return [
    ...(report.daily === null ? [] : [dailyLine(report.daily)]),
    `Refreshed    ${report.refreshed} competition-season(s)`,
    `Logged       ${report.logged} prediction(s)`,
    `Backtested   ${report.backtested} prediction(s)`,
    `Settled      ${report.settled} guess(es)`,
    ...report.failures.map((failure) => `Failed       ${failure}`),
  ];
}

function dailyLine(refreshed: number): string {
  return `Daily        ${refreshed} competition-season(s) refreshed`;
}

/**
 * The daily refresh's summary when it runs alone, as `refresh`.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */
export function describeDailyRefresh(report: DailyRefreshReport): string[] {
  return [
    dailyLine(report.refreshed),
    ...report.failures.map((failure) => `Failed       ${failure}`),
  ];
}

/**
 * Non-zero when any competition failed, so Railway marks the run failed
 * while the rest were still logged.
 *
 * decisions/052-predictions-log.md
 */
export function exitCodeFor(report: Pick<PredictionRunReport, "failures">): number {
  return report.failures.length === 0 ? 0 : 1;
}
