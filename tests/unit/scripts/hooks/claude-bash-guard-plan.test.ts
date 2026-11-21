import { describe, expect, it } from "vitest";
import {
  ADD_EVERYTHING_REFUSAL,
  bodySource,
  headRefusal,
  requestsIn,
  stagesEverything,
  unreadableBodyRefusal,
  unreadIssueRefusal,
} from "../../../../scripts/hooks/claude-bash-guard-plan";

/**
 * Which Bash commands the hook's rules cover, and what each refusal tells the
 * session that ran into it.
 *
 * decisions/806-push-and-pr-hooks.md
 */

describe("stagesEverything", () => {
  it.each([
    ["git", "add", "-A"],
    ["git", "add", "--all"],
    ["git", "add", "."],
    ["git", "add", "./"],
    ["git", "add", "-vA"],
    ["git", "add", "-A", "--", "src"],
    ["git", "add", "--", "."],
    ["git", "-C", "/x", "add", "-A"],
    ["git", "--no-pager", "-c", "a=b", "add", "."],
    ["A=1", "git", "add", "--all"],
  ])("refuses %j", (...words) => {
    expect(stagesEverything(words)).toBe(true);
  });

  it.each([
    ["git", "add", "src/a.ts", "tests/a.test.ts"],
    ["git", "add", "-p", "src"],
    ["git", "add", "--", "-A"],
    ["git", "add", "--update"],
    ["git", "commit", "-A"],
    ["git", "add"],
    ["git"],
    ["git", "-C"],
    ["echo", "git", "add", "-A"],
    [],
  ])("lets %j through", (...words) => {
    expect(stagesEverything(words)).toBe(false);
  });
});

describe("bodySource", () => {
  it("reads --body, -b and --body= as text", () => {
    expect(bodySource(["--body", "Closes #1"], "/r")).toEqual({ kind: "text", text: "Closes #1" });
    expect(bodySource(["-b", "x"], "/r")).toEqual({ kind: "text", text: "x" });
    expect(bodySource(["--title", "t", "--body=y"], "/r")).toEqual({ kind: "text", text: "y" });
  });

  it("reads --body-file, -F and --body-file= as a file, relative to the command's directory", () => {
    expect(bodySource(["--body-file", "body.md"], "/r")).toEqual({
      kind: "file",
      path: "/r/body.md",
    });
    expect(bodySource(["-F", "/tmp/b.md"], "/r")).toEqual({ kind: "file", path: "/tmp/b.md" });
    expect(bodySource(["--body-file=/tmp/b.md"], null)).toEqual({
      kind: "file",
      path: "/tmp/b.md",
    });
  });

  it("cannot read a body built by the shell", () => {
    for (const value of ["$(cat body.md)", "`cat body.md`"]) {
      expect(bodySource(["--body", value], "/r")).toEqual({
        kind: "unreadable",
        reason: "the body is built by the shell when the command runs",
      });
    }
  });

  it("cannot read a body file given as stdin, by a variable, or relative to an unknown directory", () => {
    expect(bodySource(["--body-file", "-"], "/r")).toMatchObject({
      kind: "unreadable",
      reason: "the body is read from stdin",
    });
    expect(bodySource(["--body-file", "$F"], "/r")).toMatchObject({
      reason: "the body file's path is built by the shell",
    });
    expect(bodySource(["--body-file", "b.md"], null)).toMatchObject({
      reason: "the body file is relative to a directory this hook cannot follow",
    });
  });

  it.each([
    "--fill",
    "--fill-first",
    "--fill-verbose",
    "-f",
    "--web",
    "-w",
    "--editor",
    "-e",
    "--template",
    "-T",
  ])("cannot read a body %s leaves to gh", (option) => {
    expect(bodySource([option, "--body", "x"], "/r")).toEqual({
      kind: "unreadable",
      reason: `\`${option}\` leaves the body to gh`,
    });
  });

  it("cannot read a body the command does not give, or gives no value for", () => {
    for (const args of [[], ["--title", "t"], ["--body"], ["--body-file"]]) {
      expect(bodySource(args, "/r")).toEqual({
        kind: "unreadable",
        reason: "the command gives no body",
      });
    }
  });
});

describe("requestsIn", () => {
  it("finds a git add of everything anywhere in the line", () => {
    expect(requestsIn("cd /x && git add -A && git commit -m y", "/r").addsEverything).toBe(true);
    expect(requestsIn("git add a.ts && git commit -m 'git add -A'", "/r").addsEverything).toBe(
      false
    );
  });

  it("finds each gh pr create and gh pr new, with the directory it runs in", () => {
    const { pullRequests } = requestsIn(
      "cd /wt && gh pr create --body-file b.md; GH_TOKEN=t gh pr new -b x",
      "/r"
    );

    expect(pullRequests).toEqual([
      { cwd: "/wt", body: { kind: "file", path: "/wt/b.md" } },
      { cwd: "/wt", body: { kind: "text", text: "x" } },
    ]);
  });

  it("ignores other gh commands and mentions of gh pr create", () => {
    const { pullRequests } = requestsIn(
      "gh pr view 1 && gh issue create && echo 'gh pr create' && gh pr",
      "/r"
    );

    expect(pullRequests).toEqual([]);
  });
});

describe("headRefusal", () => {
  const sha = (char: string) => char.repeat(40);

  it("passes a branch whose pushed head is its local HEAD", () => {
    expect(headRefusal({ head: sha("a"), upstream: sha("a"), branch: "chore/1-x" })).toBeNull();
  });

  it("refuses a local HEAD ahead of what was pushed, naming both and the chained-push case", () => {
    const refusal = headRefusal({ head: sha("a"), upstream: sha("b"), branch: "chore/1-x" });

    expect(refusal).toContain("chore/1-x");
    expect(refusal).toContain("aaaaaaa");
    expect(refusal).toContain("bbbbbbb");
    expect(refusal).toContain("git push && gh pr create");
  });

  it("refuses a branch with no upstream, and says how to push it", () => {
    expect(headRefusal({ head: sha("a"), upstream: null, branch: "chore/1-x" })).toContain(
      "git push -u origin chore/1-x"
    );
    expect(headRefusal({ head: sha("a"), upstream: null, branch: null })).toContain(
      "this checkout, which has no upstream"
    );
    expect(headRefusal({ head: sha("a"), upstream: null, branch: null })).toContain(
      "git push -u origin <branch>"
    );
  });

  it("refuses where git cannot read HEAD", () => {
    expect(headRefusal({ head: null, upstream: null, branch: null })).toContain(
      "cannot read the checkout's HEAD"
    );
  });
});

describe("refusal texts", () => {
  it("say what to do instead", () => {
    expect(ADD_EVERYTHING_REFUSAL).toContain("git add <path>");
    expect(unreadableBodyRefusal("because")).toContain("because");
    expect(unreadableBodyRefusal("because")).toContain("--body-file <path>");
    expect(unreadIssueRefusal(7, "GitHub answered 404")).toContain("#7");
    expect(unreadIssueRefusal(7, "GitHub answered 404")).toContain("GitHub answered 404");
  });
});
