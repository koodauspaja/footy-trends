/**
 * The predictions runner's decisions (specs/052), apart from its I/O:
 * `predictions.ts` connects and runs; what it runs, what it prints and how it
 * exits is decided here, where it can be tested.
 */

import type { PredictionRunReport } from "../src/lib/prediction-log-service";

export type PredictionCommand = "log" | "backtest";

export const USAGE = [
  "Usage:",
  "  DATABASE_URL=<target> npm run predictions -- log       the hourly run (specs/052, S1)",
  "  DATABASE_URL=<target> npm run predictions -- backtest  backtest rows (S10)",
];

/** The command asked for, or null for anything else. */
export function parseCommand(args: readonly string[]): PredictionCommand | null {
  if (args.length !== 1) return null;
  const [command] = args;
  return command === "log" || command === "backtest" ? command : null;
}

/** The run's summary, one line per fact and per failure. */
export function describeRun(report: PredictionRunReport): string[] {
  return [
    `Refreshed    ${report.refreshed} competition-season(s)`,
    `Logged       ${report.logged} prediction(s)`,
    ...report.failures.map((failure) => `Failed       ${failure}`),
  ];
}

/**
 * Non-zero when any competition failed, so Railway marks the run failed
 * while the rest were still logged (S1).
 */
export function exitCodeFor(report: PredictionRunReport): number {
  return report.failures.length === 0 ? 0 : 1;
}
