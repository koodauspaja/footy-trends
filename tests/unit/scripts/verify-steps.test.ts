import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Stage } from "../../../scripts/verify-plan";
import { VERIFY_STAGES } from "../../../scripts/verify-plan";
import {
  runVerify,
  startVerify,
  type VerifyActions,
  verifyActions,
} from "../../../scripts/verify-steps";

const STAGES: Stage[] = [
  { name: "Lint", script: "lint", typical: "~1s" },
  { name: "Unit tests", script: "test:unit", typical: "~40s" },
  { name: "End-to-end tests", script: "test:e2e", typical: "~4min" },
];

/** Every action recorded, and a clock that ticks a second per reading. */
function actions(overrides: Partial<VerifyActions> = {}) {
  const steps: string[] = [];
  let clock = 0;

  const base: VerifyActions = {
    stages: STAGES,
    runScript: async (name) => {
      steps.push(`run:${name}`);
      return 0;
    },
    now: () => {
      clock += 1000;
      return clock;
    },
    out: (line) => steps.push(`out:${line}`),
    err: (line) => steps.push(`err:${line}`),
  };

  return { ...base, ...overrides, steps };
}

const said = (a: { steps: string[] }) => a.steps.join("\n");

describe("runVerify", () => {
  it("runs every stage in order and reports the total", async () => {
    const a = actions();

    expect(await runVerify(a)).toBe(0);
    expect(a.steps.filter((step) => step.startsWith("run:"))).toEqual([
      "run:lint",
      "run:test:unit",
      "run:test:e2e",
    ]);
    expect(said(a)).toContain("All 3 stages passed");
  });

  it("numbers the stages as it goes, so a four-minute one says what it is", async () => {
    const a = actions();

    await runVerify(a);

    expect(said(a)).toContain("[1/3] Lint");
    expect(said(a)).toContain("[3/3] End-to-end tests — npm run test:e2e (~4min)");
  });

  it("stops at the first failure, and does not run the stages after it", async () => {
    const a = actions({
      runScript: async (name) => {
        a.steps.push(`run:${name}`);
        return name === "test:unit" ? 1 : 0;
      },
    });

    expect(await runVerify(a)).toBe(1);
    expect(a.steps).not.toContain("run:test:e2e");
    expect(said(a)).toContain("Unit tests failed");
    expect(said(a)).not.toContain("All 3 stages passed");
  });

  it("exits with the failing stage's own code, which is not always 1", async () => {
    const a = actions({
      runScript: async (name) => {
        a.steps.push(`run:${name}`);
        return name === "lint" ? 2 : 0;
      },
    });

    expect(await runVerify(a)).toBe(2);
  });

  it("runs the real stage list when given it", async () => {
    const a = actions({ stages: VERIFY_STAGES });

    expect(await runVerify(a)).toBe(0);
    expect(a.steps.filter((step) => step.startsWith("run:"))).toEqual(
      VERIFY_STAGES.map((stage) => `run:${stage.script}`)
    );
  });
});

describe("verifyActions", () => {
  it("runs an npm script through npm's own path, not through PATH", async () => {
    /**
     * Spawned for real, with a stand-in for npm that records its arguments and
     * exits 0 — the way `docker.test.ts` exercises its spawn with a harmless
     * command.
     */
    const dir = mkdtempSync(path.join(tmpdir(), "footy-verify-"));
    const log = path.join(dir, "argv.json");
    const fakeNpm = path.join(dir, "fake-npm.js");
    writeFileSync(
      fakeNpm,
      `require("node:fs").writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));`
    );

    const built = verifyActions(fakeNpm);

    expect(await built.runScript("lint")).toBe(0);
    expect(JSON.parse(readFileSync(log, "utf8"))).toEqual(["run", "lint"]);
    expect(built.stages).toBe(VERIFY_STAGES);
    expect(built.now()).toBeGreaterThan(0);
  });

  it("writes its lines to stdout and stderr, each ending a line", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    try {
      const built = verifyActions("/does/not/run.js");
      built.out("starting");
      built.err("failed");

      // Asserted before restoring: `mockRestore` clears the call history too.
      expect(out).toHaveBeenCalledWith("starting\n");
      // A blank line first, so a failure is not lost against a wall of output.
      expect(err).toHaveBeenCalledWith("\nfailed\n");
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });
});

describe("startVerify", () => {
  it("refuses, with the way to start it, when npm did not", async () => {
    const npmExecPath = process.env.npm_execpath;
    delete process.env.npm_execpath;
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    try {
      await expect(startVerify()).resolves.toBe(1);
      expect(err).toHaveBeenCalledWith(expect.stringContaining("npm run"));
    } finally {
      err.mockRestore();
      if (npmExecPath !== undefined) process.env.npm_execpath = npmExecPath;
    }
  });

  it("runs every stage against the npm it was given", async () => {
    /**
     * A stand-in npm that exits 0 for anything, so the whole sequence runs
     * without running a suite — six spawns of `node`, not six test runs.
     */
    const dir = mkdtempSync(path.join(tmpdir(), "footy-verify-"));
    const log = path.join(dir, "calls.log");
    const fakeNpm = path.join(dir, "fake-npm.js");
    writeFileSync(
      fakeNpm,
      `require("node:fs").appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ") + "\\n");`
    );

    const npmExecPath = process.env.npm_execpath;
    process.env.npm_execpath = fakeNpm;
    // Silenced: this is a real run of the real actions, and its progress lines
    // would otherwise be printed in the middle of the suite's own output.
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      expect(await startVerify()).toBe(0);
    } finally {
      out.mockRestore();
      if (npmExecPath === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = npmExecPath;
    }

    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(
      VERIFY_STAGES.map((stage) => `run ${stage.script}`)
    );
  });
});
