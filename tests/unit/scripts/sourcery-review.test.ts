import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The check's entry point, imported: nothing runs unless Node was pointed at
 * the file.
 *
 * decisions/559-sourcery-review-kind.md
 */

const { runWhenMain, startCheck } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startCheck: vi.fn(async () => 0),
}));

vi.mock("../../../scripts/entry-point", () => ({ runWhenMain }));
vi.mock("../../../scripts/sourcery-review-steps", () => ({ startCheck }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("scripts/sourcery-review.ts", () => {
  it("offers itself to runWhenMain, and checks nothing by itself", async () => {
    await import("../../../scripts/sourcery-review");

    expect(runWhenMain).toHaveBeenCalledWith(
      process.argv,
      "scripts/sourcery-review.ts",
      startCheck
    );
    expect(startCheck).not.toHaveBeenCalled();
  });

  it("names the path npm runs, so the guard can recognise it", async () => {
    const { default: packageJson } = await import("../../../package.json");
    await import("../../../scripts/sourcery-review");

    const script = vi.mocked(runWhenMain).mock.calls[0]?.[1];

    expect(script).toBe("scripts/sourcery-review.ts");
    expect(packageJson.scripts["check:sourcery"]).toContain(script);
  });
});
