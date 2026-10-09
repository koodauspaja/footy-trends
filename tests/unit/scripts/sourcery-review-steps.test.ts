import { describe, expect, it, vi } from "vitest";
import {
  checkReview,
  jsonReader,
  type ReadJson,
  runCheck,
  startCheck,
} from "../../../scripts/sourcery-review-steps";

/**
 * The sequence behind `npm run check:sourcery`, with the reading injected so
 * the whole command runs without a network: what is read for each of the five
 * outcomes, what is not, and the exit code.
 *
 * decisions/559-sourcery-review-kind.md
 */

const REPOSITORY = "koodauspaja/footy-trends";
const ROOT = `/repos/${REPOSITORY}`;

const HEAD = "f4e9a2da8d79ff975d6284198f2d00373a46813b";
const REVIEWED = "797ee79000000000000000000000000000000000";
const BASE = "ba5e000000000000000000000000000000000000";

const FOUND = "Hey - I've found 2 issues\n\n<details>";
const QUICK = "### Sourcery assessment\n\n**Approved.**";
const BUDGET =
  "Sorry @someone, this account has used its review budget of 1,500,000 diff characters for the last 7 days.\n\nYou can request another review in 10 hours.";

const NOT_ENOUGH = /^Not enough/;

type Stub = {
  pull?: number;
  head?: string;
  reviews?: unknown[];
  runs?: unknown[];
  /** Keyed `from...to`. */
  comparisons?: Record<string, unknown>;
};

function sourcery(commit: string, body: string | null, submittedAt: string) {
  return {
    user: { login: "sourcery-ai[bot]" },
    commit_id: commit,
    body,
    submitted_at: submittedAt,
  };
}

function run(conclusion: string | null, summary: string | null = "Completed", id = 1) {
  return {
    id,
    app: { slug: "sourcery-ai" },
    status: conclusion === null ? "in_progress" : "completed",
    conclusion,
    output: { summary },
  };
}

function files(...entries: [path: string, patch?: string][]) {
  return entries.map(([filename, patch]) =>
    patch === undefined ? { filename } : { filename, patch }
  );
}

// A reader over the answers a scenario has, failing loudly on anything else:
// a path that is read without being stubbed is a request the check should not
// have made.
function reading({
  pull = 552,
  head = HEAD,
  reviews = [],
  runs = [],
  comparisons = {},
}: Stub): ReadJson {
  const answers: Record<string, unknown> = {
    [`${ROOT}/pulls/${pull}`]: { head: { sha: HEAD }, base: { sha: BASE } },
    [`${ROOT}/pulls/${pull}/reviews?per_page=100&page=1`]: reviews,
    [`${ROOT}/commits/${head}/check-runs?per_page=100`]: { check_runs: runs },
  };
  for (const [range, answer] of Object.entries(comparisons)) {
    answers[`${ROOT}/compare/${range}`] = answer;
  }

  return (path) =>
    path in answers
      ? Promise.resolve(answers[path])
      : Promise.reject(new Error(`nothing stubbed for ${path}`));
}

function check(stub: Stub, head?: string) {
  return checkReview({ pull: stub.pull ?? 552, head, repository: REPOSITORY, read: reading(stub) });
}

function consoleSpy() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    lines: { out, err },
  };
}

describe("checkReview", () => {
  it("passes a head with a full review, and compares nothing", async () => {
    const result = await check({
      reviews: [sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z")],
      runs: [run("success")],
    });

    expect(result).toEqual({
      passed: true,
      lines: ["#552 at f4e9a2d: a full review.", "Check-run: success.", "Enough to hand off."],
    });
  });

  it("fails the quick check when a test changed after the full review", async () => {
    const result = await check({
      reviews: [
        sourcery(REVIEWED, FOUND, "2026-10-05T06:06:37Z"),
        sourcery(HEAD, QUICK, "2026-10-05T06:23:07Z"),
      ],
      runs: [run("success")],
      comparisons: {
        [`${REVIEWED}...${HEAD}`]: {
          status: "ahead",
          files: files(
            ["docs/setup/011-branch-protection.md", "+a line"],
            ["tests/unit/docs/setup-chain.test.ts", "+expect(1).toBe(1);"]
          ),
        },
        [`${BASE}...${HEAD}`]: { status: "ahead", files: files(["docs/infrastructure.md", "+x"]) },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lines).toEqual([
      "#552 at f4e9a2d: the quick check only.",
      "Check-run: success.",
      "The last full review was of 797ee79. Changed since then:",
      "  documentation: docs/setup/011-branch-protection.md",
      "  code, test or configuration: tests/unit/docs/setup-chain.test.ts",
      expect.stringMatching(NOT_ENOUGH),
    ]);
  });

  it("passes the quick check when only a comment changed after the full review", async () => {
    const result = await check({
      reviews: [
        sourcery(REVIEWED, FOUND, "2026-10-05T08:22:00Z"),
        sourcery(HEAD, QUICK, "2026-10-05T08:30:16Z"),
      ],
      runs: [run("success")],
      comparisons: {
        [`${REVIEWED}...${HEAD}`]: {
          status: "ahead",
          files: files(["src/lib/team-page-context.ts", "@@ -1 +1 @@\n-// before\n+// after"]),
        },
      },
    });

    expect(result.passed).toBe(true);
    expect(result.lines).toContain("  comments only: src/lib/team-page-context.ts");
  });

  it("judges an earlier head when given one, without the reviews that came later", async () => {
    const earlier = "304d479";
    const result = await check(
      {
        head: earlier,
        reviews: [
          sourcery("3890507000000000000000000000000000000000", BUDGET, "2026-10-05T09:23:29Z"),
          sourcery("304d479000000000000000000000000000000000", QUICK, "2026-10-05T10:16:42Z"),
          sourcery("ddcfb82000000000000000000000000000000000", FOUND, "2026-10-05T22:09:01Z"),
        ],
        runs: [run("success")],
        comparisons: {
          [`${BASE}...${earlier}`]: {
            status: "ahead",
            files: files(["src/lib/team-panels.ts", "+x"]),
          },
        },
      },
      earlier
    );

    expect(result.passed).toBe(false);
    expect(result.lines).toEqual([
      "#552 at 304d479: the quick check only.",
      "Check-run: success.",
      "No full review came before it.",
      expect.stringMatching(NOT_ENOUGH),
    ]);
  });

  it("compares the pull request with itself when the branch was rebased after the full review", async () => {
    const result = await check({
      reviews: [
        sourcery(REVIEWED, FOUND, "2026-10-05T06:06:37Z"),
        sourcery(HEAD, QUICK, "2026-10-05T06:23:07Z"),
      ],
      runs: [run("success")],
      comparisons: {
        [`${REVIEWED}...${HEAD}`]: {
          status: "diverged",
          files: files(["src/from-the-base-branch.ts", "+not this pull request's"]),
        },
        [`${BASE}...${REVIEWED}`]: {
          status: "ahead",
          files: files(["src/lib/form.ts", "+same"], ["docs/infrastructure.md", "+before"]),
        },
        [`${BASE}...${HEAD}`]: {
          status: "ahead",
          files: files(["src/lib/form.ts", "+same"], ["docs/infrastructure.md", "+after"]),
        },
      },
    });

    expect(result.passed).toBe(true);
    expect(result.lines).toEqual([
      "#552 at f4e9a2d: the quick check only.",
      "Check-run: success.",
      "The last full review was of 797ee79, and the branch has been rebased since. Changed since then:",
      "  documentation: docs/infrastructure.md",
      "Enough: nothing but comments and documentation changed since the full review.",
    ]);
  });

  it.each([
    ["earlier", "before"],
    ["present", "after"],
  ])("fails a rebased branch whose %s diff is too long to compare in full", async (_name, long) => {
    const many = Array.from({ length: 300 }, (_, index) => ({
      filename: `docs/${index}.md`,
      patch: "+x",
    }));
    const few = files(["docs/0.md", "+x"]);
    const result = await check({
      reviews: [
        sourcery(REVIEWED, FOUND, "2026-10-05T06:06:37Z"),
        sourcery(HEAD, QUICK, "2026-10-05T06:23:07Z"),
      ],
      comparisons: {
        [`${REVIEWED}...${HEAD}`]: { status: "diverged", files: [] },
        [`${BASE}...${REVIEWED}`]: { status: "ahead", files: long === "before" ? many : few },
        [`${BASE}...${HEAD}`]: { status: "ahead", files: long === "after" ? many : few },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lines).toContain("  and possibly more: GitHub lists 300 files of a comparison");
  });

  it("fails a comparison that reached GitHub's limit, though every listed file is a document", async () => {
    const many = Array.from({ length: 300 }, (_, index) => ({
      filename: `docs/${index}.md`,
      patch: "+x",
    }));
    const result = await check({
      reviews: [
        sourcery(REVIEWED, FOUND, "2026-10-05T06:06:37Z"),
        sourcery(HEAD, QUICK, "2026-10-05T06:23:07Z"),
      ],
      comparisons: {
        [`${REVIEWED}...${HEAD}`]: { status: "ahead", files: many },
        [`${BASE}...${HEAD}`]: { status: "ahead", files: many },
      },
    });

    expect(result.passed).toBe(false);
  });

  it("reports a budget notice written as a review of the head", async () => {
    const result = await check({
      reviews: [sourcery(HEAD, BUDGET, "2026-10-05T09:23:29Z")],
      runs: [run("skipped", BUDGET)],
      comparisons: {
        [`${BASE}...${HEAD}`]: { status: "ahead", files: files(["src/lib/form.ts", "+x"]) },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lines.slice(0, 3)).toEqual([
      "#552 at f4e9a2d: a budget notice, and no review.",
      "Check-run: skipped.",
      "Sorry @someone, this account has used its review budget of 1,500,000 diff characters for the last 7 days.",
    ]);
  });

  it("reports a budget notice that only the skipped check-run carries", async () => {
    const result = await check({
      runs: [run("skipped", BUDGET)],
      comparisons: {
        [`${BASE}...${HEAD}`]: { status: "ahead", files: files(["src/lib/form.ts", "+x"]) },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lines[0]).toBe("#552 at f4e9a2d: a budget notice, and no review.");
  });

  it("fails a skip on a pull request that has something to review", async () => {
    const result = await check({
      runs: [run("skipped", "This pull request has hit its limit of 5 automatic re-reviews.")],
      comparisons: {
        [`${BASE}...${HEAD}`]: {
          status: "ahead",
          files: files(["package.json", "+x"], ["docs/infrastructure.md", "+x"]),
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lines.slice(0, 3)).toEqual([
      "#552 at f4e9a2d: a skip, and no review.",
      "Check-run: skipped.",
      "This pull request has hit its limit of 5 automatic re-reviews.",
    ]);
  });

  it("passes a skip on a pull request of the manifest and the lockfile alone", async () => {
    const result = await check({
      runs: [run("skipped", "This pull request has hit its limit of 5 automatic re-reviews.")],
      comparisons: {
        [`${BASE}...${HEAD}`]: {
          status: "ahead",
          files: files(["package.json", "+x"], ["package-lock.json"]),
        },
      },
    });

    expect(result.passed).toBe(true);
    expect(result.lines.at(-1)).toMatch(/^Enough: every path in the pull request/);
  });

  it("fails a head Sourcery wrote nothing about, and lists what changed since its full review", async () => {
    const result = await check({
      reviews: [sourcery(REVIEWED, FOUND, "2026-10-05T22:09:01Z")],
      runs: [run("success")],
      comparisons: {
        [`${REVIEWED}...${HEAD}`]: {
          status: "ahead",
          files: files(["specs/037-blown-leads.md", "+x"]),
        },
        [`${BASE}...${HEAD}`]: {
          status: "ahead",
          files: files(["specs/037-blown-leads.md", "+x"]),
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lines).toEqual([
      "#552 at f4e9a2d: nothing from Sourcery.",
      "Check-run: success.",
      "The last full review was of 797ee79. Changed since then:",
      "  documentation: specs/037-blown-leads.md",
      expect.stringMatching(NOT_ENOUGH),
    ]);
  });

  it("fails a pull request with no reviews, no check-run and no listed files", async () => {
    // GitHub leaves `files` out of a comparison with nothing in it.
    const result = await check({ comparisons: { [`${BASE}...${HEAD}`]: { status: "identical" } } });

    expect(result.passed).toBe(false);
    expect(result.lines).toEqual([
      "#552 at f4e9a2d: nothing from Sourcery.",
      "Check-run: none.",
      "No full review came before it.",
      expect.stringMatching(NOT_ENOUGH),
    ]);
  });

  it("reads Sourcery's latest check-run at the head, and nobody else's", async () => {
    const result = await check({
      reviews: [sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z")],
      runs: [
        run("skipped", "An earlier run", 10),
        run("success", null, 30),
        { ...run("failure", "Another app's", 40), app: { slug: "sonarqubecloud" } },
        { ...run("failure", "No app at all", 50), app: null },
      ],
    });

    expect(result.lines[1]).toBe("Check-run: success.");
  });

  it("reads every page of reviews, so a review past the first hundred still counts", async () => {
    const replies = Array.from({ length: 100 }, () => ({
      user: null,
      commit_id: HEAD,
      body: null,
      submitted_at: "2026-10-05T07:00:00Z",
    }));
    const answers: Record<string, unknown> = {
      [`${ROOT}/pulls/552`]: { head: { sha: HEAD }, base: { sha: BASE } },
      [`${ROOT}/pulls/552/reviews?per_page=100&page=1`]: replies,
      [`${ROOT}/pulls/552/reviews?per_page=100&page=2`]: [
        sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z"),
      ],
      [`${ROOT}/commits/${HEAD}/check-runs?per_page=100`]: { check_runs: [] },
    };

    const result = await checkReview({
      pull: 552,
      repository: REPOSITORY,
      read: (path) =>
        path in answers ? Promise.resolve(answers[path]) : Promise.reject(new Error(path)),
    });

    expect(result.passed).toBe(true);
    expect(result.lines[0]).toBe("#552 at f4e9a2d: a full review.");
  });

  it("refuses a review of the head it does not recognise, rather than calling it nothing", async () => {
    const stub = {
      reviews: [
        sourcery(HEAD, "### Sourcery assessment\n\n**Changes requested.**", "2026-10-05T07:57:42Z"),
      ],
    };

    await expect(check(stub)).rejects.toThrow("It starts: ### Sourcery assessment");
  });
});

describe("runCheck", () => {
  const passing = () =>
    reading({
      pull: 556,
      reviews: [sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z")],
      runs: [run("success")],
    });
  const failing = () =>
    reading({
      pull: 556,
      comparisons: { [`${BASE}...${HEAD}`]: { status: "ahead", files: files(["src/a.ts", "+x"]) } },
    });

  it("exits 0 and writes the report to stdout when the review is enough", async () => {
    const spy = consoleSpy();

    expect(await runCheck(["node", "script", "556"], { GH_TOKEN: "token" }, spy, passing)).toBe(0);
    expect(spy.lines.out[0]).toBe("#556 at f4e9a2d: a full review.");
    expect(spy.lines.err).toEqual([]);
  });

  it("exits 1 and writes the report to stderr when it is not", async () => {
    const spy = consoleSpy();

    expect(await runCheck(["node", "script", "556"], { GH_TOKEN: "token" }, spy, failing)).toBe(1);
    expect(spy.lines.err[0]).toBe("#556 at f4e9a2d: nothing from Sourcery.");
    expect(spy.lines.out).toEqual([]);
  });

  it.each([
    ["no pull request number", ["node", "script"]],
    ["a pull request number that is not one", ["node", "script", "abc"]],
    ["a pull request number of zero", ["node", "script", "0"]],
    ["a pull request number in hexadecimal", ["node", "script", "0x10"]],
    ["a pull request number with an exponent", ["node", "script", "1e2"]],
    ["a pull request number too large to be one", ["node", "script", "99999999999999999999"]],
    ["a commit that is too short", ["node", "script", "556", "f4e9a2"]],
    ["a commit that is not hexadecimal", ["node", "script", "556", "main-branch"]],
  ])("exits 1 with the usage on %s, and reads nothing", async (_name, argv) => {
    const spy = consoleSpy();
    const reader = vi.fn(passing);

    expect(await runCheck(argv, { GH_TOKEN: "token" }, spy, reader)).toBe(1);
    expect(spy.lines.err[0]).toBe(
      "Usage: npm run check:sourcery -- <pull request number> [<commit>]"
    );
    expect(reader).not.toHaveBeenCalled();
  });

  it("judges the commit it is given in place of the head", async () => {
    const spy = consoleSpy();
    const earlier = "304d479";
    const reader = () =>
      reading({
        pull: 558,
        head: earlier,
        reviews: [
          sourcery("304d479000000000000000000000000000000000", FOUND, "2026-10-05T10:16:42Z"),
        ],
      });

    expect(
      await runCheck(["node", "script", "558", earlier], { GH_TOKEN: "token" }, spy, reader)
    ).toBe(0);
    expect(spy.lines.out[0]).toBe("#558 at 304d479: a full review.");
  });

  it("exits 1 and says how to set a token when there is none", async () => {
    const spy = consoleSpy();

    expect(await runCheck(["node", "script", "556"], {}, spy, passing)).toBe(1);
    expect(spy.lines.err.join("\n")).toContain(
      "GH_TOKEN=$(gh auth token) npm run check:sourcery -- 556"
    );
  });

  it("falls back to GITHUB_TOKEN when GH_TOKEN is exported but empty", async () => {
    const spy = consoleSpy();
    const reader = vi.fn(passing);

    expect(
      await runCheck(["node", "script", "556"], { GH_TOKEN: "", GITHUB_TOKEN: "ci" }, spy, reader)
    ).toBe(0);
    expect(reader).toHaveBeenCalledWith("ci");
  });

  it("reads the repository the environment names", async () => {
    const spy = consoleSpy();
    const paths: string[] = [];
    const reader = () => (path: string) => {
      paths.push(path);
      return Promise.reject(new Error("stop here"));
    };

    await runCheck(
      ["node", "script", "7"],
      { GH_TOKEN: "token", GITHUB_REPOSITORY: "someone/fork" },
      spy,
      reader
    );

    expect(paths).toEqual(["/repos/someone/fork/pulls/7"]);
  });

  it("exits 1 when GitHub cannot be read, and says which pull request", async () => {
    const spy = consoleSpy();
    const reader = () => () => Promise.reject(new Error("GitHub answered 403 for /repos/x"));

    expect(await runCheck(["node", "script", "556"], { GH_TOKEN: "token" }, spy, reader)).toBe(1);
    expect(spy.lines.err).toEqual([
      "Could not read Sourcery's review of #556: GitHub answered 403 for /repos/x",
    ]);
  });
});

describe("jsonReader", () => {
  it("asks GitHub for the path, with the token and the version header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "ahead" }), { status: 200 }));

    expect(await jsonReader("token")("/repos/x/compare/a...b")).toEqual({ status: "ahead" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/x/compare/a...b",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "X-GitHub-Api-Version": "2022-11-28",
        }),
      })
    );
    fetchSpy.mockRestore();
  });

  it("throws with the status, so a commit GitHub no longer has is not an empty comparison", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));

    await expect(jsonReader("token")("/repos/x/compare/a...b")).rejects.toThrow(
      "GitHub answered 404 for /repos/x/compare/a...b"
    );
    fetchSpy.mockRestore();
  });
});

describe("startCheck", () => {
  it("wires the process's own argv, environment and streams", async () => {
    const written: string[] = [];
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    const argv = vi.spyOn(process, "argv", "get").mockReturnValue(["node", "script"]);

    expect(await startCheck()).toBe(1);
    expect(written.join("")).toContain("Usage: npm run check:sourcery");

    argv.mockRestore();
    errSpy.mockRestore();
  });

  it("writes a passing report to stdout", async () => {
    const written: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    const argv = vi.spyOn(process, "argv", "get").mockReturnValue(["node", "script", "556"]);
    const answers = [
      { head: { sha: HEAD }, base: { sha: BASE } },
      [sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z")],
      { check_runs: [] },
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const path = String(url);
      let answer = answers[0];
      if (path.includes("/reviews")) answer = answers[1];
      if (path.includes("/check-runs")) answer = answers[2];
      return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
    });
    const previous = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "token";

    expect(await startCheck()).toBe(0);
    expect(written.join("")).toContain("#556 at f4e9a2d: a full review.\n");

    // `delete`, not `= undefined`, which would leave the string "undefined".
    if (previous === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = previous;

    expect(process.env.GH_TOKEN).toBe(previous);
    fetchSpy.mockRestore();
    argv.mockRestore();
    outSpy.mockRestore();
  });
});
