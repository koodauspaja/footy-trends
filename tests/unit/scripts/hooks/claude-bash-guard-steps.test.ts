import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALLOW,
  bashCall,
  defaultDeps,
  type GuardDeps,
  githubToken,
  REFUSE,
  refusals,
  runGuard,
  startGuard,
} from "../../../../scripts/hooks/claude-bash-guard-steps";

/**
 * The Bash hook as Claude Code runs it: its input, the git state and issues it
 * reads, and the exit code that lets a command run or stops it.
 *
 * decisions/806-push-and-pr-hooks.md
 */

const { readFileSync, executablePath } = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  executablePath: vi.fn(),
}));

vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  readFileSync.mockImplementation(actual.readFileSync);
  return { ...actual, readFileSync };
});

vi.mock("../../../../scripts/shared/executable", () => ({ executablePath }));

afterEach(() => {
  vi.unstubAllGlobals();
  readFileSync.mockClear();
  executablePath.mockReset();
});

const PUSHED = "a".repeat(40);
const LOCAL = "b".repeat(40);

/** A checkout and its issues, as the hook would find them. */
function deps({
  head = PUSHED,
  upstream = PUSHED as string | null,
  files = {} as Record<string, string>,
  issues = {} as Record<number, string>,
} = {}): GuardDeps & { gitCalls: string[][] } {
  const gitCalls: string[][] = [];
  return {
    gitCalls,
    git: (cwd, args) => {
      gitCalls.push([cwd, ...args]);
      if (args[0] === "symbolic-ref") return "chore/806-x";
      if (args.includes("@{upstream}")) return upstream;
      return head;
    },
    readFile: (path) => files[path] ?? null,
    readIssue: (issue) => {
      const body = issues[issue];
      return body === undefined
        ? Promise.reject(new Error(`GitHub answered 404 for #${issue}`))
        : Promise.resolve(body);
    },
  };
}

function consoleSpy() {
  const err: string[] = [];
  return { out: () => undefined, err: (line: string) => err.push(line), lines: err };
}

function hookInput(command: string, toolName = "Bash"): string {
  return JSON.stringify({ tool_name: toolName, tool_input: { command }, cwd: "/repo" });
}

describe("refusals", () => {
  it("lets an ordinary command through without reading anything", async () => {
    const found = deps();

    expect(await refusals("git status && npm test", "/repo", found)).toEqual([]);
    expect(found.gitCalls).toEqual([]);
  });

  it("refuses git add of everything", async () => {
    const found = await refusals("git add -A", "/repo", deps());

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("Stage the paths by name");
  });

  it("lets gh pr create through when the head is pushed and every closed issue's boxes are settled", async () => {
    const found = await refusals(
      "gh pr create --body-file /b.md",
      "/repo",
      deps({
        files: { "/b.md": "Closes #806\nFixes #7" },
        issues: { 806: "- [x] done", 7: "- [ ] later — **not ticked: needs a release.**" },
      })
    );

    expect(found).toEqual([]);
  });

  it("asks git in the directory the command runs in", async () => {
    const checkout = deps({ files: { "/wt/b.md": "no issue" } });

    await refusals("cd /wt && gh pr create --body-file b.md", "/repo", checkout);

    expect(checkout.gitCalls.map(([cwd]) => cwd)).toEqual(["/wt", "/wt", "/wt"]);
  });

  it("refuses gh pr create when the local HEAD is not what was pushed", async () => {
    const found = await refusals("gh pr create -b none", "/repo", deps({ head: LOCAL }));

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("is not the pushed head");
  });

  it("checks the branch --head names, not the checkout's", async () => {
    const checkout = deps();

    await refusals("gh pr create -b none --head chore/1-x", "/repo", checkout);

    expect(checkout.gitCalls).toEqual([
      ["/repo", "rev-parse", "--verify", "--quiet", "refs/heads/chore/1-x"],
      ["/repo", "rev-parse", "--verify", "--quiet", "refs/heads/chore/1-x@{upstream}"],
    ]);
  });

  it("refuses a --head branch whose local commit is not what was pushed", async () => {
    const checkout = {
      ...deps(),
      git: (_cwd: string, args: readonly string[]) =>
        String(args.at(-1)).endsWith("@{upstream}") ? PUSHED : LOCAL,
    };

    const found = await refusals("gh pr create -b none -H chore/1-x", "/repo", checkout);

    expect(found[0]).toContain("chore/1-x, whose local HEAD");
  });

  it("refuses gh pr create on a branch with no upstream", async () => {
    const found = await refusals("gh pr create -b none", "/repo", deps({ upstream: null }));

    expect(found[0]).toContain("git push -u origin chore/806-x");
  });

  it("refuses gh pr create that closes an issue with a bare box, naming the box", async () => {
    const found = await refusals(
      "gh pr create -b 'Closes #806'",
      "/repo",
      deps({
        issues: { 806: "- [x] one\n- [ ] the table is on the issue" },
      })
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("neither ticked nor explained");
    expect(found[0]).toContain("the table is on the issue");
  });

  it("refuses gh pr create that closes an issue it cannot read", async () => {
    const found = await refusals("gh pr create -b 'Closes #9'", "/repo", deps());

    expect(found).toEqual([expect.stringContaining("GitHub answered 404 for #9")]);
  });

  it("names a problem that is not an Error by its text", async () => {
    const checkout = { ...deps(), readIssue: () => Promise.reject("offline") };

    const found = await refusals("gh pr create -b 'Closes #9'", "/repo", checkout);

    expect(found[0]).toContain("offline");
  });

  it("refuses a body it cannot read, from the command line or from disk", async () => {
    const shell = await refusals(`gh pr create --body "$(cat b.md)"`, "/repo", deps());
    const missing = await refusals("gh pr create --body-file /gone.md", "/repo", deps());

    expect(shell[0]).toContain("built by the shell");
    expect(missing[0]).toContain("/gone.md cannot be read");
  });

  it("refuses gh pr create after a cd it cannot follow, without asking git", async () => {
    const checkout = deps();

    const found = await refusals("cd ~/wt && gh pr create -b x", "/repo", checkout);

    expect(found[0]).toContain("cannot tell which branch");
    expect(checkout.gitCalls).toEqual([]);
  });

  it("gives every refusal a line earns, the head's before the boxes'", async () => {
    const found = await refusals(
      "git add . && gh pr create -b 'Closes #9'",
      "/repo",
      deps({ head: LOCAL })
    );

    expect(found).toHaveLength(3);
    expect(found[0]).toContain("git add");
    expect(found[1]).toContain("pushed head");
    expect(found[2]).toContain("#9");
  });
});

describe("bashCall", () => {
  it("reads the command and directory of a Bash call", () => {
    expect(bashCall(hookInput("ls"))).toEqual({ command: "ls", cwd: "/repo" });
  });

  it("returns null for another tool, a missing field, or input that is not JSON", () => {
    expect(bashCall(hookInput("ls", "Read"))).toBeNull();
    expect(
      bashCall(JSON.stringify({ tool_name: "Bash", tool_input: {}, cwd: "/repo" }))
    ).toBeNull();
    expect(
      bashCall(JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }))
    ).toBeNull();
    expect(bashCall(JSON.stringify({ tool_name: "Bash", cwd: "/repo" }))).toBeNull();
    expect(bashCall("not json")).toBeNull();
  });
});

describe("runGuard", () => {
  it("exits 0 and prints nothing for a command no rule covers", async () => {
    const console = consoleSpy();

    expect(await runGuard(hookInput("ls"), deps(), console)).toBe(ALLOW);
    expect(console.lines).toEqual([]);
  });

  it("exits 2 with every refusal on stderr, which is what blocks the call", async () => {
    const console = consoleSpy();

    expect(await runGuard(hookInput("git add --all"), deps(), console)).toBe(REFUSE);
    expect(REFUSE).toBe(2);
    expect(console.lines.join("\n")).toContain("Stage the paths by name");
  });

  it("lets the command run, and says so, when its input cannot be read", async () => {
    const console = consoleSpy();

    expect(await runGuard("{", deps(), console)).toBe(ALLOW);
    expect(console.lines[0]).toContain("runs unchecked");
  });
});

describe("githubToken", () => {
  it("prefers GH_TOKEN, then GITHUB_TOKEN, then the GitHub CLI's, skipping empty ones", () => {
    const cli = vi.fn(() => "from-cli");

    expect(githubToken({ GH_TOKEN: "a", GITHUB_TOKEN: "b" }, cli)).toBe("a");
    expect(githubToken({ GH_TOKEN: "", GITHUB_TOKEN: "b" }, cli)).toBe("b");
    expect(githubToken({ GH_TOKEN: "" }, cli)).toBe("from-cli");
    expect(githubToken({}, () => null)).toBeNull();
  });
});

describe("defaultDeps", () => {
  it("runs git in the given directory and reads its trimmed output", () => {
    executablePath.mockReturnValue("/usr/bin/git");
    const directory = mkdtempSync(join(tmpdir(), "guard-"));

    expect(defaultDeps({}).git(directory, ["rev-parse", "--show-toplevel"])).toBeNull();
    expect(defaultDeps({}).git(process.cwd(), ["rev-parse", "--is-inside-work-tree"])).toBe("true");
  });

  it("answers null when git cannot be found", () => {
    executablePath.mockReturnValue(null);

    expect(defaultDeps({}).git(process.cwd(), ["status"])).toBeNull();
  });

  it("reads a file, and answers null for one that is not there", () => {
    const path = join(mkdtempSync(join(tmpdir(), "guard-")), "body.md");
    writeFileSync(path, "Closes #1");

    expect(defaultDeps({}).readFile(path)).toBe("Closes #1");
    expect(defaultDeps({}).readFile(`${path}.gone`)).toBeNull();
  });

  it("reads an issue's body from the repository's issues route, with the token", async () => {
    const fetch = vi.fn(async () => Response.json({ body: "- [x] one" }));
    vi.stubGlobal("fetch", fetch);

    const body = await defaultDeps({ GH_TOKEN: "t", GITHUB_REPOSITORY: "o/r" }).readIssue(5);

    expect(body).toBe("- [x] one");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/o/r/issues/5",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer t" }) })
    );
  });

  it("reads this repository's issues by default, with the GitHub CLI's token", async () => {
    executablePath.mockReturnValue("/bin/echo");
    const fetch = vi.fn(async () => Response.json({ body: "" }));
    vi.stubGlobal("fetch", fetch);

    await defaultDeps({}).readIssue(5);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/koodauspaja/footy-trends/issues/5",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer auth token" }),
      })
    );
  });

  it("fails to read an issue when there is no token at all", async () => {
    executablePath.mockReturnValue(null);

    await expect(defaultDeps({}).readIssue(5)).rejects.toThrow("no GitHub token");
  });
});

describe("startGuard", () => {
  it("reads the hook input from stdin", async () => {
    readFileSync.mockImplementationOnce(() => hookInput("ls"));

    expect(await startGuard()).toBe(ALLOW);
    expect(readFileSync).toHaveBeenCalledWith(0, "utf8");
  });
});
