import { describe, expect, it } from "vitest";
import {
  executableFor,
  exitCodeFor,
  parseInvocation,
  usageMessage,
} from "../../../scripts/with-test-db-plan";

describe("parseInvocation", () => {
  it("takes the first argument as the command and the rest as its arguments", () => {
    expect(parseInvocation(["node", "node_modules/vitest/vitest.mjs", "run"])).toEqual({
      ok: true,
      command: "node",
      args: ["node_modules/vitest/vitest.mjs", "run"],
    });
  });

  it("accepts a command with no arguments at all", () => {
    expect(parseInvocation(["npm"])).toEqual({ ok: true, command: "npm", args: [] });
  });

  it.each([[[]], [[""]]])("refuses %j, with the usage line", (argv) => {
    // This wrapper exists to run something against the test database, and
    // "nothing" is not something — defaulting would run an empty spawn instead.
    const parsed = parseInvocation(argv);

    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.message).toBe(usageMessage());
  });

  it("names the script in its usage line, so the message says what to run", () => {
    expect(usageMessage()).toContain("scripts/with-test-db.ts");
  });

  it("keeps a flag that looks like an option as an argument", () => {
    expect(parseInvocation(["node", "--test"])).toEqual({
      ok: true,
      command: "node",
      args: ["--test"],
    });
  });
});

describe("executableFor", () => {
  it("runs `node` as the very Node that started this", () => {
    /**
     * A package binary through `node_modules/.bin` would be a `.cmd` shim on
     * Windows, which `spawn` cannot execute without a shell — the trap
     * `executable.ts` documents — and could be a different runtime besides.
     */
    expect(executableFor("node", "/usr/local/bin/node")).toBe("/usr/local/bin/node");
  });

  it("leaves any other command alone", () => {
    expect(executableFor("npm", "/usr/local/bin/node")).toBe("npm");
  });
});

describe("exitCodeFor", () => {
  it("passes a child's own code through", () => {
    expect(exitCodeFor(0)).toBe(0);
    expect(exitCodeFor(2)).toBe(2);
  });

  it("reports 1 for a signalled child, which has no code", () => {
    // Otherwise a killed run would read as success.
    expect(exitCodeFor(null)).toBe(1);
  });
});
