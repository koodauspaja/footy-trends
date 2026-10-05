import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The thresholds that fail a unit run below 100% coverage. Read as text: the
 * configuration loads `.env` and edits the environment when it is evaluated.
 */
const CONFIGURATION = readFileSync("vitest.config.ts", "utf8");

function thresholds(): Record<string, number> {
  const [, block = ""] = /\bthresholds:\s*\{([^}]*)\}/.exec(CONFIGURATION) ?? [];
  return Object.fromEntries(
    [...block.matchAll(/(\w+):\s*(\d+(?:\.\d+)?)/g)].map(([, name = "", value = ""]) => [
      name,
      Number(value),
    ])
  );
}

describe("the unit coverage thresholds", () => {
  it("require 100% of statements, branches, functions and lines", () => {
    expect(thresholds()).toEqual({ statements: 100, branches: 100, functions: 100, lines: 100 });
  });

  it("are stated once, so no second block can quietly override the first", () => {
    expect(CONFIGURATION.match(/\bthresholds:/g)).toHaveLength(1);
  });
});
