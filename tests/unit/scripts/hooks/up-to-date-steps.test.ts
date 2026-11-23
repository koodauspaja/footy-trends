import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultGit,
  type Git,
  MAIN_REFSPEC,
  runCheck,
  startCheck,
} from "../../../../scripts/hooks/up-to-date-steps";

/**
 * The pre-push up-to-date check with git injected: what it fetches, which
 * commits it compares, and the exit code that lets git push or not.
 *
 * decisions/806-push-and-pr-hooks.md
 */

const { readFileSync, executablePath } = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  executablePath: vi.fn(),
}));

vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, readFileSync };
});

vi.mock("../../../../scripts/shared/executable", () => ({ executablePath }));

afterEach(() => {
  readFileSync.mockReset();
  executablePath.mockReset();
  vi.restoreAllMocks();
});

const CURRENT = "c".repeat(40);
const STALE = "d".repeat(40);
const ZERO = "0".repeat(40);

function push(branch: string, sha: string): string {
  return `refs/heads/${branch} ${sha} refs/heads/${branch} ${ZERO}\n`;
}

/**
 * A repository where only `CURRENT` contains origin/main.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function repository({ fetches = true, branch = "chore/806-x" } = {}): Git & { calls: string[][] } {
  const calls: string[][] = [];
  const git = ((args: readonly string[]) => {
    calls.push([...args]);
    if (args[0] === "fetch") return { status: fetches ? 0 : 128, stdout: "" };
    if (args[0] === "symbolic-ref")
      return branch === "" ? { status: 1, stdout: "" } : { status: 0, stdout: branch };
    if (args[0] === "rev-parse") return { status: 0, stdout: CURRENT };
    if (args[0] === "merge-base") return { status: args[3] === CURRENT ? 0 : 1, stdout: "" };
    return null;
  }) as Git & { calls: string[][] };
  git.calls = calls;
  return git;
}

function consoleSpy() {
  const err: string[] = [];
  return { out: () => undefined, err: (line: string) => err.push(line), lines: err };
}

describe("runCheck", () => {
  it("passes a branch that contains origin/main, after fetching it", () => {
    const git = repository();

    expect(runCheck(push("chore/806-x", CURRENT), git, consoleSpy())).toBe(0);
    expect(git.calls[0]).toEqual(["fetch", "--quiet", "origin", MAIN_REFSPEC]);
    expect(MAIN_REFSPEC).toBe("+refs/heads/main:refs/remotes/origin/main");
    expect(git.calls[1]).toEqual(["merge-base", "--is-ancestor", "origin/main", CURRENT]);
  });

  it("refuses a branch one commit behind origin/main, and says to rebase", () => {
    const console = consoleSpy();

    expect(runCheck(push("chore/806-x", STALE), repository(), console)).toBe(1);
    expect(console.lines.join("\n")).toContain("chore/806-x is behind origin/main");
    expect(console.lines.join("\n")).toContain("git rebase origin/main");
  });

  it("refuses when git cannot answer whether the branch contains origin/main", () => {
    const git = ((args: readonly string[]) =>
      args[0] === "merge-base" ? null : { status: 0, stdout: "" }) as Git;

    expect(runCheck(push("chore/806-x", CURRENT), git, consoleSpy())).toBe(1);
  });

  it("does not check or fetch for a push of main or release", () => {
    const git = repository();

    expect(runCheck(push("main", STALE) + push("release", STALE), git, consoleSpy())).toBe(0);
    expect(git.calls).toEqual([]);
  });

  it("skips with a message when the fetch fails", () => {
    const console = consoleSpy();

    expect(runCheck(push("chore/806-x", STALE), repository({ fetches: false }), console)).toBe(0);
    expect(console.lines[0]).toContain("could not fetch origin/main");
  });

  it("checks the current branch's HEAD, and says so, when the pushed refs are not in git's shape", () => {
    const git = repository();
    const console = consoleSpy();

    expect(runCheck("nonsense", git, console)).toBe(0);
    expect(console.lines[0]).toContain("checking HEAD");
    expect(git.calls).toContainEqual(["merge-base", "--is-ancestor", "origin/main", CURRENT]);
  });

  it("does not check HEAD when it is main", () => {
    const git = repository({ branch: "main" });

    expect(runCheck(null, git, consoleSpy())).toBe(0);
    expect(git.calls.some(([command]) => command === "fetch")).toBe(false);
  });

  it("checks the current branch's HEAD when there is no stdin", () => {
    const git = repository();

    expect(runCheck(null, git, consoleSpy())).toBe(0);
    expect(runCheck("  ", git, consoleSpy())).toBe(0);
    expect(git.calls.filter(([command]) => command === "merge-base")).toHaveLength(2);
  });

  it("checks nothing without stdin on a detached HEAD", () => {
    const git = repository({ branch: "" });

    expect(runCheck(null, git, consoleSpy())).toBe(0);
    expect(git.calls.some(([command]) => command === "fetch")).toBe(false);
  });
});

describe("defaultGit", () => {
  it("runs git and returns its status and trimmed output", () => {
    executablePath.mockReturnValue("/usr/bin/git");

    expect(defaultGit(["rev-parse", "--is-inside-work-tree"])).toEqual({
      status: 0,
      stdout: "true",
    });
  });

  it("returns null when git cannot be found or does not finish", () => {
    executablePath.mockReturnValue(null);
    expect(defaultGit(["status"])).toBeNull();

    executablePath.mockReturnValue("/nonexistent/git");
    expect(defaultGit(["status"])).toBeNull();
  });
});

describe("startCheck", () => {
  it("reads the pushed refs from stdin when stdin is not a terminal", async () => {
    readFileSync.mockReturnValue(push("main", STALE));

    expect(await startCheck({ isTTY: false })).toBe(0);
    expect(readFileSync).toHaveBeenCalledWith(0, "utf8");
  });

  it("checks HEAD when stdin is a terminal or cannot be read", async () => {
    executablePath.mockReturnValue(null);
    expect(await startCheck({ isTTY: true })).toBe(0);
    expect(readFileSync).not.toHaveBeenCalled();

    readFileSync.mockImplementation(() => {
      throw new Error("EAGAIN");
    });
    expect(await startCheck({})).toBe(0);
  });
});
