import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The check's entry point, imported: nothing runs unless Node was pointed at
 * it. And the three places that run it: the npm script, the commit-msg hook and
 * CI's `Commit messages` job.
 *
 * decisions/841-commit-subject-gate.md
 */

const { runWhenMain, startCheck } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startCheck: vi.fn(async () => 0),
}));

vi.mock("../../../../scripts/shared/entry-point", () => ({ runWhenMain }));
vi.mock("../../../../scripts/hooks/commit-subject-steps", () => ({ startCheck }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

/** A shell or YAML file's lines that run, trimmed: a commented-out line is not one. */
function activeLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

describe("scripts/hooks/commit-subjects.ts", () => {
  it("offers itself to runWhenMain under the path npm runs, and checks nothing by itself", async () => {
    const { default: packageJson } = await import("../../../../package.json");
    await import("../../../../scripts/hooks/commit-subjects");

    expect(runWhenMain).toHaveBeenCalledWith(
      process.argv,
      "scripts/hooks/commit-subjects.ts",
      startCheck
    );
    expect(startCheck).not.toHaveBeenCalled();
    expect(packageJson.scripts["check:commits"]).toBe("tsx scripts/hooks/commit-subjects.ts");
  });

  it("is run by the commit-msg hook on the message file git passes it", () => {
    expect(activeLines(".husky/commit-msg")).toContain(
      'node_modules/.bin/tsx scripts/hooks/commit-subjects.ts --message "$1"'
    );
  });

  it("is run by CI on the pull request's title, passed through the environment", () => {
    const workflow = activeLines(".github/workflows/ci.yml").join("\n");

    expect(workflow).toContain('run: npm run check:commits -- --subject "$TITLE"');
    expect(workflow).toMatch(/TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/);
  });

  it("is run by CI on every commit the pull request adds over its base", () => {
    // The workflow's own `${{ … }}` expressions, matched as written.
    expect(activeLines(".github/workflows/ci.yml").join("\n")).toMatch(
      /npm run check:commits -- \$\{\{ github\.event\.pull_request\.base\.sha \}\}\.\.\$\{\{ github\.event\.pull_request\.head\.sha \}\}/
    );
  });
});
