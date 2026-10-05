import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Unit coverage is held at 100%, and `vitest.config.ts`'s thresholds are what
 * fail a run below it. A threshold is one number in a configuration file, which
 * is easy to lower "for now" in a pull request that is about something else.
 *
 * Read as text rather than imported: the configuration loads `.env` and edits
 * the environment as it is evaluated, which a test has no business repeating.
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
