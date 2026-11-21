import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADD_EVERYTHING_REFUSAL,
  bodySource,
  headBranch,
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
    ["then", "git", "add", "-A"],
    ["env", "A=1", "git", "add", "."],
    ["command", "git", "add", "-A"],
    ["/usr/bin/git", "add", "-A"],
    ["git", "add", "*"],
    ["git", "add", "./*"],
    ["git", "add", ":/"],
    ["git", "add", ":/."],
    ["env", "-i", "git", "add", "-A"],
    ["env", "-u", "HOME", "git", "add", "."],
  ])("refuses %j", (...words) => {
    expect(stagesEverything(words)).toBe(true);
  });

  it.each([
    ["git", "add", "src/a.ts", "tests/a.test.ts"],
    ["git", "add", "-p", "src"],
    ["git", "add", "src/*.ts"],
    ["git", "add", ":/src"],
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
      { cwd: "/wt", body: { kind: "file", path: "/wt/b.md" }, head: null },
      { cwd: "/wt", body: { kind: "text", text: "x" }, head: null },
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

  it("refuses where git cannot read the commit it would open", () => {
    expect(headRefusal({ head: null, upstream: null, branch: null })).toContain(
      "whose local commit git cannot read"
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

describe("repeated and expanded bodies", () => {
  it("reads the last body option, as gh does", () => {
    expect(bodySource(["--body", "first", "--body", "Closes #2"], "/r")).toEqual({
      kind: "text",
      text: "Closes #2",
    });
    expect(bodySource(["--body", "x", "--body-file", "/b.md"], "/r")).toEqual({
      kind: "file",
      path: "/b.md",
    });
  });

  it("cannot read a body that names a shell variable", () => {
    // `${ISSUE}` as the shell writes it, not a template placeholder.
    const braced = ["Closes #$", "{ISSUE}"].join("");
    for (const value of ["$BODY", braced, "x $_y"]) {
      expect(bodySource(["--body", value], "/r")).toMatchObject({ kind: "unreadable" });
    }
    for (const value of ["$1", "a $@ b", "$#", "$?", "$$", "$!", "$-", "$*"]) {
      expect(bodySource(["--body", value], "/r")).toMatchObject({ kind: "unreadable" });
    }
    expect(bodySource(["--body", "costs 5 $ and $. more"], "/r")).toMatchObject({ kind: "text" });
  });
});

describe("headBranch", () => {
  it("reads --head, -H and --head=, without an owner, and the last one given", () => {
    expect(headBranch(["--head", "chore/1-x"])).toBe("chore/1-x");
    expect(headBranch(["-H", "someone:feature/2-y"])).toBe("feature/2-y");
    expect(headBranch(["--head=a", "--head", "b"])).toBe("b");
  });

  it("is null when no head is named, or named without a value", () => {
    expect(headBranch(["--title", "t"])).toBeNull();
    expect(headBranch(["--head"])).toBeNull();
  });
});

describe("a body file written in the same line", () => {
  it("cannot be read before the line writes it", () => {
    const [request] = requestsIn(
      "cat > b.md <<'EOF'\nCloses #9\nEOF\ngh pr create --body-file b.md",
      "/r"
    ).pullRequests;

    expect(request?.body).toEqual({
      kind: "unreadable",
      reason: "/r/b.md is written by the same command line, after this hook has run",
    });
  });

  it("is matched through each command's own directory", () => {
    const line = "cd /wt && echo x >> ../wt/b.md; gh pr create -F /wt/b.md";

    expect(requestsIn(line, "/r").pullRequests[0]?.body).toMatchObject({ kind: "unreadable" });
  });

  it("is read when the line writes other files, or writes it only after", () => {
    const before = requestsIn("echo x > other.md && gh pr create -F b.md", "/r").pullRequests[0];
    const after = requestsIn("gh pr create -F b.md; echo x > b.md", "/r").pullRequests[0];

    expect(before?.body).toEqual({ kind: "file", path: "/r/b.md" });
    expect(after?.body).toEqual({ kind: "file", path: "/r/b.md" });
  });

  it("cannot be matched to a write from a directory this hook lost", () => {
    const request = requestsIn("cd ~ && echo x > b.md; gh pr create -F /r/b.md", "/r")
      .pullRequests[0];

    expect(request?.body).toEqual({ kind: "file", path: "/r/b.md" });
  });

  it("names the branch --head gives", () => {
    expect(requestsIn("gh pr create -b x --head chore/1-x", "/r").pullRequests[0]?.head).toBe(
      "chore/1-x"
    );
  });

  it("recognises gh by its path, and after a keyword", () => {
    expect(requestsIn("/opt/homebrew/bin/gh pr create -b x", "/r").pullRequests).toHaveLength(1);
    expect(requestsIn("if true; then gh pr create -b x; fi", "/r").pullRequests).toHaveLength(1);
  });
});

describe("round two's forms", () => {
  it("reads an attached short option's value", () => {
    expect(headBranch(["-Hchore/1-x"])).toBe("chore/1-x");
    expect(bodySource(["-bCloses #3"], "/r")).toEqual({ kind: "text", text: "Closes #3" });
    expect(bodySource(["-F/tmp/b.md"], "/r")).toEqual({ kind: "file", path: "/tmp/b.md" });
  });

  it("expands a body file under ~/ into the home directory", () => {
    expect(bodySource(["--body-file", "~/b.md"], null)).toEqual({
      kind: "file",
      path: join(homedir(), "b.md"),
    });
  });

  it("recognises gh pr create with --repo or -R before pr, between pr and create, or after", () => {
    for (const line of [
      "gh -R o/r pr create -b x",
      "gh --repo o/r pr create -b x",
      "gh --repo=o/r pr create -b x",
      "gh pr -R o/r create -b x",
      "gh pr create -R o/r -b x",
    ]) {
      expect(requestsIn(line, "/r").pullRequests, line).toEqual([
        { cwd: "/r", body: { kind: "text", text: "x" }, head: null },
      ]);
    }
  });

  it("reads a title that looks like -R as a title, after create", () => {
    expect(requestsIn('gh pr create --title "-Rework" -b x', "/r").pullRequests).toEqual([
      { cwd: "/r", body: { kind: "text", text: "x" }, head: null },
    ]);
  });

  it("takes a redirection to a target the shell builds as one that may write the body file", () => {
    const [request] = requestsIn('echo x > "$F"; gh pr create -F b.md', "/r").pullRequests;

    expect(request?.body).toMatchObject({ kind: "unreadable" });
  });

  it("does not take a read of the body file for a write", () => {
    const [request] = requestsIn("wc -l < b.md && gh pr create -F b.md", "/r").pullRequests;

    expect(request?.body).toEqual({ kind: "file", path: "/r/b.md" });
  });
});
