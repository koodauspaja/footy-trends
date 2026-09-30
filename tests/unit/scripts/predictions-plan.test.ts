import { describe, expect, it } from "vitest";
import { describeRun, exitCodeFor, parseCommand, USAGE } from "../../../scripts/predictions-plan";

describe("parseCommand", () => {
  it("accepts log and backtest", () => {
    expect(parseCommand(["log"])).toBe("log");
    expect(parseCommand(["backtest"])).toBe("backtest");
  });

  it("refuses anything else, no command, or more than one", () => {
    expect(parseCommand([])).toBeNull();
    expect(parseCommand(["logs"])).toBeNull();
    expect(parseCommand(["log", "backtest"])).toBeNull();
  });

  it("names both commands in its usage", () => {
    expect(USAGE.join("\n")).toMatch(/predictions -- log/);
    expect(USAGE.join("\n")).toMatch(/predictions -- backtest/);
  });
});

describe("describeRun and exitCodeFor", () => {
  it("reports a clean run and exits 0", () => {
    const report = { refreshed: 2, logged: 14, failures: [] };

    expect(describeRun(report)).toEqual([
      "Refreshed    2 competition-season(s)",
      "Logged       14 prediction(s)",
    ]);
    expect(exitCodeFor(report)).toBe(0);
  });

  it("names each failure and exits 1, however many were logged", () => {
    const report = { refreshed: 1, logged: 9, failures: ["refresh taso VL 2026"] };

    expect(describeRun(report)).toContain("Failed       refresh taso VL 2026");
    expect(exitCodeFor(report)).toBe(1);
  });
});
