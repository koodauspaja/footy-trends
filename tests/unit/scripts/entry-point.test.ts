import { afterEach, describe, expect, it, vi } from "vitest";
import { isEntryPoint, runWhenMain } from "../../../scripts/entry-point";

/**
 * The guard that lets an entry point be imported by a test instead of excluded
 * from coverage — `setup-main.ts` from #400, `verify.ts` from #401.
 */

describe("isEntryPoint", () => {
  it("recognises the path tsx and npm actually pass", () => {
    // Measured: `tsx scripts/setup-main.ts` and `npm run setup` both give the
    // absolute path of the file.
    const argv = ["/usr/bin/node", "/Users/someone/footy-trends/scripts/setup-main.ts"];

    expect(isEntryPoint(argv, "scripts/setup-main.ts")).toBe(true);
  });

  it("recognises it with Windows separators", () => {
    const argv = ["node.exe", String.raw`C:\dev\footy-trends\scripts\setup-main.ts`];

    expect(isEntryPoint(argv, "scripts/setup-main.ts")).toBe(true);
  });

  it("says no under the test runner, which is what makes the import safe", () => {
    // The real value in this very process.
    expect(isEntryPoint(process.argv, "scripts/setup-main.ts")).toBe(false);
    expect(process.argv[1]).toContain("vitest");
  });

  it("says no for another script, and for no script at all", () => {
    expect(isEntryPoint(["node", "/repo/scripts/db-reset.ts"], "scripts/setup-main.ts")).toBe(
      false
    );
    expect(isEntryPoint(["node"], "scripts/setup-main.ts")).toBe(false);
  });

  it("requires the match to fall on a path boundary", () => {
    /**
     * A bare `endsWith` accepted this: the string really does end with
     * `scripts/setup-main.ts`, but the directory is `not-scripts`. An unrelated
     * file would have started setup. Raised in review on #409.
     */
    expect(isEntryPoint(["node", "/tmp/not-scripts/setup-main.ts"], "scripts/setup-main.ts")).toBe(
      false
    );
  });

  it("accepts the path given exactly, with no directory before it", () => {
    expect(isEntryPoint(["node", "scripts/setup-main.ts"], "scripts/setup-main.ts")).toBe(true);
  });

  it("does not match a file that merely ends the same way", () => {
    // The directory is part of the comparison, so a `not-setup-main.ts`, or a
    // `setup-main.ts` somewhere else, is not this script.
    expect(isEntryPoint(["node", "/repo/scripts/not-setup-main.ts"], "scripts/setup-main.ts")).toBe(
      false
    );
    expect(isEntryPoint(["node", "/repo/other/setup-main.ts"], "scripts/setup-main.ts")).toBe(
      false
    );
  });
});

describe("runWhenMain", () => {
  const exitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = exitCode;
  });

  it("starts nothing when this process is not that script", async () => {
    const start = vi.fn(async () => 3);

    runWhenMain(["node", "/repo/scripts/something-else.ts"], "scripts/setup-main.ts", start);
    await Promise.resolve();

    expect(start).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(exitCode);
  });

  it("starts it, and takes its exit code, when it is", async () => {
    const start = vi.fn(async () => 2);

    runWhenMain(["node", "/repo/scripts/setup-main.ts"], "scripts/setup-main.ts", start);
    // The call is not awaited by `runWhenMain` — nothing above it could — so
    // let the microtask that sets the code run.
    await vi.waitFor(() => expect(process.exitCode).toBe(2));

    expect(start).toHaveBeenCalledTimes(1);
  });
});
