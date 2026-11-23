import { describe, expect, it } from "vitest";
import {
  describeDailyRefresh,
  describeRun,
  exitCodeFor,
  parseCommand,
  USAGE,
} from "../../../../scripts/predictions/predictions-plan";

/**
 * The predictions script's command line, and how a run is described and what it
 * exits with.
 *
 * decisions/052-predictions-log.md
 * decisions/072-match-guesses.md
 * decisions/080-daily-refresh-of-every-competition.md
 */

describe("parseCommand", () => {
  it("accepts log, backtest, settle and refresh", () => {
    expect(parseCommand(["log"])).toBe("log");
    expect(parseCommand(["backtest"])).toBe("backtest");
    expect(parseCommand(["settle"])).toBe("settle");
    expect(parseCommand(["refresh"])).toBe("refresh");
  });

  it("refuses anything else, no command, or more than one", () => {
    expect(parseCommand([])).toBeNull();
    expect(parseCommand(["logs"])).toBeNull();
    expect(parseCommand(["log", "backtest"])).toBeNull();
  });

  it("names every command in its usage", () => {
    expect(USAGE.join("\n")).toMatch(/predictions -- log/);
    expect(USAGE.join("\n")).toMatch(/predictions -- backtest/);
    expect(USAGE.join("\n")).toMatch(/predictions -- settle/);
    expect(USAGE.join("\n")).toMatch(/predictions -- refresh/);
  });
});

describe("describeRun and exitCodeFor", () => {
  it("reports a clean run and exits 0", () => {
    const report = {
      refreshed: 2,
      logged: 14,
      backtested: 6,
      settled: 3,
      daily: null,
      failures: [],
    };

    expect(describeRun(report)).toEqual([
      "Refreshed    2 competition-season(s)",
      "Logged       14 prediction(s)",
      "Backtested   6 prediction(s)",
      "Settled      3 guess(es)",
    ]);
    expect(exitCodeFor(report)).toBe(0);
  });

  it("names each failure and exits 1, however many were logged", () => {
    const report = {
      refreshed: 1,
      logged: 9,
      backtested: 0,
      settled: 0,
      daily: null,
      failures: ["refresh taso VL 2026"],
    };

    expect(describeRun(report)).toContain("Failed       refresh taso VL 2026");
    expect(exitCodeFor(report)).toBe(1);
  });

  it("puts the daily refresh first in the hour it ran", () => {
    const report = {
      refreshed: 2,
      logged: 14,
      backtested: 6,
      settled: 3,
      daily: 25,
      failures: [],
    };

    expect(describeRun(report)).toEqual([
      "Daily        25 competition-season(s) refreshed",
      "Refreshed    2 competition-season(s)",
      "Logged       14 prediction(s)",
      "Backtested   6 prediction(s)",
      "Settled      3 guess(es)",
    ]);
  });
});

describe("describeDailyRefresh", () => {
  it("reports the refresh alone, each failure named, and exits as the hourly run does", () => {
    const clean = { refreshed: 24, failures: [] };
    const failed = { refreshed: 23, failures: ["daily taso VL 2026"] };

    expect(describeDailyRefresh(clean)).toEqual([
      "Daily        24 competition-season(s) refreshed",
    ]);
    expect(exitCodeFor(clean)).toBe(0);
    expect(describeDailyRefresh(failed)).toEqual([
      "Daily        23 competition-season(s) refreshed",
      "Failed       daily taso VL 2026",
    ]);
    expect(exitCodeFor(failed)).toBe(1);
  });
});
