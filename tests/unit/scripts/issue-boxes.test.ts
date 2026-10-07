import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The check's entry point, imported: nothing runs unless Node was pointed at
 * the file, so it is a tested source file and not a line in
 * `sonar.coverage.exclusions`.
 *
 * decisions/463-bare-issue-boxes-fail.md
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
    // `package.json` says `tsx scripts/issue-boxes.ts`, and `runWhenMain` compares
    // that spelling against `argv[1]`. A rename in one place and not the other
    // would leave the check silently doing nothing, the state it exists to end.
    const { default: packageJson } = await import("../../../package.json");
    await import("../../../scripts/issue-boxes");

    const script = vi.mocked(runWhenMain).mock.calls[0]?.[1];

    expect(script).toBe("scripts/issue-boxes.ts");
    expect(packageJson.scripts["check:boxes"]).toContain(script);
  });
});
