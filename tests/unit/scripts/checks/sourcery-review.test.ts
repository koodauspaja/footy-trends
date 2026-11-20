import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The check's entry point, imported: nothing runs unless Node was pointed at
 * the file.
 *
 * decisions/597-check-sourcery.md
 */

const { runWhenMain, startCheck } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startCheck: vi.fn(async () => 0),
}));

vi.mock("../../../../scripts/shared/entry-point", () => ({ runWhenMain }));
vi.mock("../../../../scripts/checks/sourcery-review-steps", () => ({ startCheck }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("scripts/checks/sourcery-review.ts", () => {
  it("offers itself to runWhenMain, and checks nothing by itself", async () => {
    await import("../../../../scripts/checks/sourcery-review");

    expect(runWhenMain).toHaveBeenCalledWith(
      process.argv,
      "scripts/checks/sourcery-review.ts",
      startCheck
    );
    expect(startCheck).not.toHaveBeenCalled();
  });

  it("names the path npm runs, so the guard can recognise it", async () => {
    const { default: packageJson } = await import("../../../../package.json");
    await import("../../../../scripts/checks/sourcery-review");

    const script = vi.mocked(runWhenMain).mock.calls[0]?.[1];

    expect(script).toBe("scripts/checks/sourcery-review.ts");
    expect(packageJson.scripts["check:sourcery"]).toContain(script);
  });
});
