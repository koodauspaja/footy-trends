import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The entry point, imported — which is the whole point of it being shaped this
 * way. Every other runner in `scripts/` calls `main()` at import and so sits in
 * `sonar.coverage.exclusions`; #400 asked not to add another, so this one hands
 * the decision to `runWhenMain` and a test can import it safely.
 */

const { runWhenMain, startSetup } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startSetup: vi.fn(async () => 0),
}));

vi.mock("../../../scripts/setup-wiring", () => ({ runWhenMain, startSetup }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("scripts/setup-main.ts", () => {
  it("offers itself to runWhenMain, and starts nothing by itself", async () => {
    await import("../../../scripts/setup-main");

    expect(runWhenMain).toHaveBeenCalledTimes(1);
    // The reference, not a call: whether setup runs is runWhenMain's decision,
    // made from argv, and this file must not pre-empt it.
    expect(runWhenMain).toHaveBeenCalledWith(process.argv, "scripts/setup-main.ts", startSetup);
    expect(startSetup).not.toHaveBeenCalled();
  });

  it("names the path npm actually runs, so the guard can recognise it", async () => {
    /**
     * `package.json` says `tsx scripts/setup.ts`, and `runWhenMain` compares
     * that spelling against `argv[1]`. A rename here with no rename there would
     * leave `npm run setup` doing nothing at all, silently — the one failure
     * this shape could introduce.
     */
    const { default: packageJson } = await import("../../../package.json");
    await import("../../../scripts/setup-main");

    const script = vi.mocked(runWhenMain).mock.calls[0]?.[1];

    expect(script).toBe("scripts/setup-main.ts");
    expect(packageJson.scripts.setup).toContain(script);
  });
});
