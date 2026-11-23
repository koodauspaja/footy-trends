import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Deps,
  defaultDeps,
  runCheck,
  startCheck,
} from "../../../../scripts/hooks/commit-subject-steps";

/**
 * `npm run check:commits` as the commit-msg hook and CI run it: one message
 * file, or every commit in a range, and the exit code that stops the commit or
 * fails the job.
 *
 * decisions/841-commit-subject-gate.md
 */

const { executablePath } = vi.hoisted(() => ({ executablePath: vi.fn() }));

vi.mock("../../../../scripts/shared/executable", async (original) => {
  const actual = await original<typeof import("../../../../scripts/shared/executable")>();
  executablePath.mockImplementation(actual.executablePath);
  return { ...actual, executablePath };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function consoleSpy() {
  const err: string[] = [];
  return { out: () => undefined, err: (line: string) => err.push(line), lines: err };
}

function deps(
  files: Record<string, string> = {},
  log: string | null = ""
): Deps & { gitCalls: string[][] } {
  const gitCalls: string[][] = [];
  return {
    gitCalls,
    readFile: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT ${path}`);
      return text;
    },
    git: (args) => {
      gitCalls.push([...args]);
      return log;
    },
  };
}

const argv = (...args: string[]) => ["node", "commit-subjects.ts", ...args];

describe("runCheck with --message", () => {
  it("refuses a message whose subject names the review, and says why", () => {
    const console = consoleSpy();

    const code = runCheck(
      argv("--message", "/m"),
      deps({ "/m": "chore: answer Sourcery's review (#1)\n\nbody" }),
      console
    );

    expect(code).toBe(1);
    expect(console.lines.join("\n")).toContain("answer Sourcery's review");
  });

  it("passes a message that says what changed, and prints nothing", () => {
    const console = consoleSpy();

    expect(runCheck(argv("--message", "/m"), deps({ "/m": "chore: x is y (#1)\n" }), console)).toBe(
      0
    );
    expect(console.lines).toEqual([]);
  });
});

describe("runCheck with --subject", () => {
  it("refuses a pull request title that names the review, and passes one that does not", () => {
    const console = consoleSpy();

    expect(runCheck(argv("--subject", "chore: apply suggestions"), deps(), console)).toBe(1);
    expect(console.lines.join("\n")).toContain('("apply suggestions")');
    expect(runCheck(argv("--subject", "chore: x is y (#1)"), deps(), consoleSpy())).toBe(0);
  });

  it("reads a title that starts with # as the subject, not as a git comment", () => {
    expect(runCheck(argv("--subject", "# answer the review comments"), deps(), consoleSpy())).toBe(
      1
    );
  });
});

describe("runCheck with a range", () => {
  it("reads a subject's own tabs as part of the subject", () => {
    const log = `${"c".repeat(40)}\tchore: tidy\tanswer the review comments\n`;
    const console = consoleSpy();

    expect(runCheck(argv("a..b"), deps({}, log), console)).toBe(1);
    expect(console.lines.join("\n")).toContain("ccccccc chore: tidy\tanswer the review comments");
  });

  it("reads every commit in the range and names each offender", () => {
    const log = `${"a".repeat(40)}\tchore: x is y (#1)\n${"b".repeat(40)}\tchore: apply suggestions\n`;
    const checkout = deps({}, log);
    const console = consoleSpy();

    expect(runCheck(argv("base..head"), checkout, console)).toBe(1);
    expect(checkout.gitCalls).toEqual([["log", "--format=%H%x09%s", "base..head"]]);
    expect(console.lines.join("\n")).toContain("bbbbbbb chore: apply suggestions");
    expect(console.lines.join("\n")).not.toContain("aaaaaaa");
  });

  it("passes a range whose subjects all say what changed, or that has no commits", () => {
    expect(
      runCheck(argv("a..b"), deps({}, `${"a".repeat(40)}\tchore: x (#1)\n`), consoleSpy())
    ).toBe(0);
    expect(runCheck(argv("a..b"), deps({}, ""), consoleSpy())).toBe(0);
  });

  it("fails when git cannot read the range", () => {
    const console = consoleSpy();

    expect(runCheck(argv("a..b"), deps({}, null), console)).toBe(1);
    expect(console.lines[0]).toContain("could not read the commits in a..b");
  });
});

describe("runCheck usage", () => {
  it.each([
    [[]],
    [["--message"]],
    [["--subject"]],
    [["main"]],
    [["a b..c"]],
    [["..b"]],
    [["a..b..c"]],
  ])("prints the usage for %j", (args) => {
    const console = consoleSpy();

    expect(runCheck(argv(...args), deps(), console)).toBe(1);
    expect(console.lines[0]).toContain("Usage: npm run check:commits");
  });
});

describe("defaultDeps", () => {
  it("reads a file", () => {
    const path = join(mkdtempSync(join(tmpdir(), "subject-")), "MSG");
    writeFileSync(path, "chore: x (#1)");

    expect(defaultDeps.readFile(path)).toBe("chore: x (#1)");
  });

  it("runs git, and answers null when it fails", () => {
    expect(defaultDeps.git(["rev-parse", "--is-inside-work-tree"])).toBe("true\n");
    expect(defaultDeps.git(["log", "no-such-ref..also-not"])).toBeNull();
  });

  it("answers null when git cannot be found", () => {
    executablePath.mockReturnValueOnce(null);

    expect(defaultDeps.git(["status"])).toBeNull();
  });
});

describe("startCheck", () => {
  it("checks the process's own arguments", async () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    expect(await startCheck()).toBe(1);
    expect(String(write.mock.calls[0]?.[0])).toContain("Usage: npm run check:commits");
  });
});
