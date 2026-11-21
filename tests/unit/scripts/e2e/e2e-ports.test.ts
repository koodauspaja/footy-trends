import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The port check's entry point, imported: nothing runs unless Node was pointed
 * at it. And `pretest:e2e`, which runs it before anything else.
 *
 * decisions/849-e2e-names-port-holders.md
 */

const { runWhenMain, startPortsCheck } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startPortsCheck: vi.fn(async () => 0),
}));

vi.mock("../../../../scripts/shared/entry-point", () => ({ runWhenMain }));
vi.mock("../../../../scripts/e2e/e2e-ports-steps", () => ({ startPortsCheck }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("scripts/e2e/e2e-ports.ts", () => {
  it("offers itself to runWhenMain, and pretest:e2e runs it first", async () => {
    const { default: packageJson } = await import("../../../../package.json");
    await import("../../../../scripts/e2e/e2e-ports");

    expect(runWhenMain).toHaveBeenCalledWith(
      process.argv,
      "scripts/e2e/e2e-ports.ts",
      startPortsCheck
    );
    expect(startPortsCheck).not.toHaveBeenCalled();
    expect(packageJson.scripts["pretest:e2e"]).toMatch(/^tsx scripts\/e2e\/e2e-ports\.ts && /);
  });
});
