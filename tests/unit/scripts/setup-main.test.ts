import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Setup's entry point, imported. A runner that calls `main()` at import has to
 * be excluded from coverage; this one hands the decision to `runWhenMain`, so a
 * test can import it safely.
 *
 * decisions/400-one-command-setup.md
 */

const { runWhenMain, startSetup } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startSetup: vi.fn(async () => 0),
}));

vi.mock("../../../scripts/entry-point", () => ({ runWhenMain }));
vi.mock("../../../scripts/setup-wiring", () => ({ startSetup }));

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
    // `package.json` says `tsx scripts/setup.ts`, and `runWhenMain` compares
    // that spelling against `argv[1]`. A rename here with no rename there would
    // leave `npm run setup` doing nothing at all, silently.
    const { default: packageJson } = await import("../../../package.json");
    await import("../../../scripts/setup-main");

    const script = vi.mocked(runWhenMain).mock.calls[0]?.[1];

    expect(script).toBe("scripts/setup-main.ts");
    expect(packageJson.scripts.setup).toContain(script);
  });
});
