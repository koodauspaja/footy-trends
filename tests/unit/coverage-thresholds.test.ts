import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The thresholds that fail a unit run below 100% coverage. Read as text: the
 * configuration loads `.env` and edits the environment when it is evaluated.
 */
const CONFIGURATION = readFileSync("vitest.config.ts", "utf8");

/** The configuration as it runs: without its comments, where a copy of a block could hide. */
function active(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** The body of the first `name: { … }` in the source, by matching braces, or `null`. */
function block(source: string, name: string): string | null {
  const start = new RegExp(`\\b${name}:\\s*\\{`).exec(source);
  if (start === null) return null;

  const open = start.index + start[0].length;
  let depth = 1;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open, index);
  }
  return null;
}

/** The thresholds vitest is given: those inside the `coverage` block, comments apart. */
function thresholds(source: string): Record<string, number> | null {
  const coverage = block(active(source), "coverage");
  const stated = coverage === null ? null : block(coverage, "thresholds");
  if (stated === null) return null;

  return Object.fromEntries(
    [...stated.matchAll(/(\w+):\s*(\d+(?:\.\d+)?)/g)].map(([, name = "", value = ""]) => [
      name,
      Number(value),
    ])
  );
}

const ALL_FOUR = { statements: 100, branches: 100, functions: 100, lines: 100 };

describe("the unit coverage thresholds", () => {
  it("require 100% of statements, branches, functions and lines", () => {
    expect(thresholds(CONFIGURATION)).toEqual(ALL_FOUR);
  });

  it("are stated once, so no second block can quietly override the first", () => {
    expect(active(CONFIGURATION).match(/\bthresholds:/g)).toHaveLength(1);
  });

  // The reading itself, on configurations that only look as if they had them.
  it.each([
    [
      "commented out, line by line",
      "coverage: {\n  // thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },\n}",
    ],
    [
      "commented out as a block",
      "coverage: {\n  /* thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }, */\n}",
    ],
    [
      "moved outside the coverage block",
      "coverage: { provider: 'v8' },\nthresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },",
    ],
    ["absent", "coverage: { provider: 'v8' }"],
  ])("finds no thresholds where they are %s", (_name, source) => {
    expect(thresholds(source)).toBeNull();
  });

  it("reads them through nested blocks and comments beside them", () => {
    const source = `test: { coverage: {
      // thresholds: { statements: 1 },
      exclude: ["a", ...list({ nested: true })],
      thresholds: { statements: 100, branches: 99.5, functions: 100, lines: 100 },
    } }`;

    expect(thresholds(source)).toEqual({ ...ALL_FOUR, branches: 99.5 });
  });
});
