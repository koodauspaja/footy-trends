import { describe, expect, it } from "vitest";
import { describeRun, exitCodeFor, parseCommand, USAGE } from "../../../scripts/predictions-plan";

/**
 * The predictions script's command line, and how a run is described and what it
 * exits with.
 *
 * decisions/052-predictions-log.md
 * decisions/072-match-guesses.md
 */

describe("parseCommand", () => {
  it("accepts log, backtest and settle", () => {
    expect(parseCommand(["log"])).toBe("log");
    expect(parseCommand(["backtest"])).toBe("backtest");
    expect(parseCommand(["settle"])).toBe("settle");
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
  });
});

describe("describeRun and exitCodeFor", () => {
  it("reports a clean run and exits 0", () => {
    const report = { refreshed: 2, logged: 14, backtested: 6, settled: 3, failures: [] };

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
      failures: ["refresh taso VL 2026"],
    };

    expect(describeRun(report)).toContain("Failed       refresh taso VL 2026");
    expect(exitCodeFor(report)).toBe(1);
  });
});
