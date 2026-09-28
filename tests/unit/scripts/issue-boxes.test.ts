import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The entry point, imported — which is why it is shaped this way. See
 * `entry-point.ts`: nothing runs unless Node was pointed at this file, so the
 * check's own entry is a tested, unexcluded source file rather than another
 * line in `sonar.coverage.exclusions`.
 */

const { runWhenMain, startCheck } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startCheck: vi.fn(async () => 0),
}));

vi.mock("../../../scripts/entry-point", () => ({ runWhenMain }));
vi.mock("../../../scripts/issue-boxes-steps", () => ({ startCheck }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("scripts/issue-boxes.ts", () => {
  it("offers itself to runWhenMain, and checks nothing by itself", async () => {
    await import("../../../scripts/issue-boxes");

    expect(runWhenMain).toHaveBeenCalledWith(process.argv, "scripts/issue-boxes.ts", startCheck);
    expect(startCheck).not.toHaveBeenCalled();
  });

  it("names the path npm actually runs, so the guard can recognise it", async () => {
    /**
     * `package.json` says `tsx scripts/issue-boxes.ts`, and `runWhenMain`
     * compares that spelling against `argv[1]`. A rename in one place and not
     * the other would leave the check doing nothing at all, silently — and a
     * check that silently does nothing is the state this whole issue exists to
     * get out of.
     */
    const { default: packageJson } = await import("../../../package.json");
    await import("../../../scripts/issue-boxes");

    const script = vi.mocked(runWhenMain).mock.calls[0]?.[1];

    expect(script).toBe("scripts/issue-boxes.ts");
    expect(packageJson.scripts["check:boxes"]).toContain(script);
  });
});
