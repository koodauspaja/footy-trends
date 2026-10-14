import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The gate's entry point, imported: nothing runs unless Node was pointed at the
 * file, so it is a tested, unexcluded source file.
 *
 * decisions/401-one-command-for-the-gate.md
 */

const { runWhenMain, startVerify } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startVerify: vi.fn(async () => 0),
}));

vi.mock("../../../scripts/entry-point", () => ({ runWhenMain }));
vi.mock("../../../scripts/verify-steps", () => ({ startVerify }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("scripts/verify.ts", () => {
  it("offers itself to runWhenMain, and starts nothing by itself", async () => {
    await import("../../../scripts/verify");

    expect(runWhenMain).toHaveBeenCalledWith(process.argv, "scripts/verify.ts", startVerify);
    expect(startVerify).not.toHaveBeenCalled();
  });

  it("names the path npm actually runs, so the guard can recognise it", async () => {
    // `package.json` says `tsx scripts/verify.ts`, and `runWhenMain` compares
    // that spelling against `argv[1]`. A rename in one place and not the other
    // would leave `npm run verify` doing nothing at all, silently.
    const { default: packageJson } = await import("../../../package.json");
    await import("../../../scripts/verify");

    const script = vi.mocked(runWhenMain).mock.calls[0]?.[1];

    expect(script).toBe("scripts/verify.ts");
    expect(packageJson.scripts.verify).toContain(script);
  });
});
