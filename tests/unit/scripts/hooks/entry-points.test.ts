import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/**
 * Each test starts real processes, `tsx` among them, which a busy machine slows.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const SPAWN_TIMEOUT = { timeout: 30_000 };

describe("scripts/hooks/claude-bash-guard.sh", SPAWN_TIMEOUT, () => {
  function runWrapper(command: string, project = process.cwd()) {
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command },
      cwd: process.cwd(),
    });
    return spawnSync("sh", [join(process.cwd(), "scripts/hooks/claude-bash-guard.sh")], {
      input,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    });
  }

  it("hands each refused form of git add to the guard, which blocks it", () => {
    for (const command of ["git add -A", "git add --all", "git add .", "git -C x add -A"]) {
      const result = runWrapper(command);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Stage the paths by name");
    }
  });

  it("starts the guard only for a command whose text could break a rule", () => {
    // A project whose tsx only says it was started, so the filter is all that is tested.
    const project = mkdtempSync(join(tmpdir(), "wrapper-"));
    mkdirSync(join(project, "node_modules/.bin"), { recursive: true });
    const tsx = join(project, "node_modules/.bin/tsx");
    writeFileSync(tsx, "#!/bin/sh\necho started >&2\n");
    chmodSync(tsx, 0o755);
    const started = (command: string) => runWrapper(command, project).stderr.includes("started");

    expect(started("ls -la")).toBe(false);
    expect(started("npm test")).toBe(false);
    expect(started("gh  pr\tcreate")).toBe(true);
    expect(started("git\tadd -A")).toBe(true);
    expect(started("gh api repos/o/r/issues/1/comments -f body='@sourcery-ai review'")).toBe(true);
  });

  it("skips the guard, and says so, where dependencies are not installed", () => {
    const result = runWrapper("git add -A", mkdtempSync(join(tmpdir(), "wrapper-")));

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("run npm install");
  });
});
