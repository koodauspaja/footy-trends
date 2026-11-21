import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The two hooks' entry points, imported: nothing runs unless Node was pointed
 * at the file. And the files that start them, which must name those paths.
 *
 * decisions/806-push-and-pr-hooks.md
 */

const { runWhenMain, startGuard, startCheck } = vi.hoisted(() => ({
  runWhenMain: vi.fn(),
  startGuard: vi.fn(async () => 0),
  startCheck: vi.fn(async () => 0),
}));

vi.mock("../../../../scripts/shared/entry-point", () => ({ runWhenMain }));
vi.mock("../../../../scripts/hooks/claude-bash-guard-steps", () => ({ startGuard }));
vi.mock("../../../../scripts/hooks/up-to-date-steps", () => ({ startCheck }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("scripts/hooks/claude-bash-guard.ts", () => {
  it("offers itself to runWhenMain under the path the shell wrapper runs", async () => {
    await import("../../../../scripts/hooks/claude-bash-guard");

    expect(runWhenMain).toHaveBeenCalledWith(
      process.argv,
      "scripts/hooks/claude-bash-guard.ts",
      startGuard
    );
    expect(startGuard).not.toHaveBeenCalled();
    expect(readFileSync("scripts/hooks/claude-bash-guard.sh", "utf8")).toContain(
      "scripts/hooks/claude-bash-guard.ts"
    );
  });

  it("is declared as Claude Code's PreToolUse hook on Bash in the tracked settings", () => {
    const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
    const bash = settings.hooks.PreToolUse.find(
      (entry: { matcher: string }) => entry.matcher === "Bash"
    );

    expect(bash.hooks[0].command).toContain("scripts/hooks/claude-bash-guard.sh");
  });
});

describe("scripts/hooks/up-to-date.ts", () => {
  it("offers itself to runWhenMain under the path the pre-push hook runs, before the e2e check", async () => {
    await import("../../../../scripts/hooks/up-to-date");
    const hook = readFileSync(".husky/pre-push", "utf8");

    expect(runWhenMain).toHaveBeenCalledWith(
      process.argv,
      "scripts/hooks/up-to-date.ts",
      startCheck
    );
    expect(startCheck).not.toHaveBeenCalled();
    expect(hook.indexOf("scripts/hooks/up-to-date.ts")).toBeGreaterThan(-1);
    expect(hook.indexOf("scripts/hooks/up-to-date.ts")).toBeLessThan(
      hook.indexOf("scripts/e2e/e2e-freshness.ts")
    );
  });
});
