import { describe, expect, it, vi } from "vitest";
import type { ReadJson } from "../../../scripts/github-read";
import { checkReview, runCheck, startCheck } from "../../../scripts/sourcery-review-steps";

/**
 * The sequence behind `npm run check:sourcery`, with the reading injected so
 * the whole command runs without a network: what is read for each of the five
 * outcomes, what is refused, and the exit code.
 *
 * decisions/597-check-sourcery.md
 */

const REPOSITORY = "koodauspaja/footy-trends";
const ROOT = `/repos/${REPOSITORY}`;

const HEAD = "f4e9a2da8d79ff975d6284198f2d00373a46813b";
const REVIEWED = "797ee79000000000000000000000000000000000";

const FOUND = "Hey - I've found 2 issues\n\n<details>";
const QUICK = "### Sourcery assessment\n\n**Approved.**";
const BUDGET =
  "Sorry @someone, this account has used its review budget of 1,500,000 diff characters for the last 7 days.\n\nYou can request another review in 10 hours.";

const NOT_ENOUGH = /^Not enough/;

type File = { filename: string; previous_filename?: string };

type Stub = {
  pull?: number;
  head?: string;
  reviews?: unknown[];
  runs?: unknown[];
  /** The comparison from the last fully reviewed commit to the head. */
  since?: { status: string; files?: File[] };
};

function sourcery(commit: string, body: string | null, submittedAt: string, state = "COMMENTED") {
  return {
    user: { login: "sourcery-ai[bot]" },
    commit_id: commit,
    state,
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

function answersFor({ pull = 552, head = HEAD, reviews = [], runs = [], since }: Stub) {
  const answers: Record<string, unknown> = {
    [`${ROOT}/pulls/${pull}`]: { head: { sha: head } },
    [`${ROOT}/pulls/${pull}/reviews?per_page=100&page=1`]: reviews,
    [`${ROOT}/commits/${head}/check-runs?per_page=100&page=1`]: { check_runs: runs },
  };
  if (since) answers[`${ROOT}/compare/${REVIEWED}...${head}`] = since;
  return answers;
}

// A reader over the answers a scenario has, failing loudly on anything else:
// a path that is read without being stubbed is a request the check should not
// have made.
function reading(stub: Stub): ReadJson {
  const answers = answersFor(stub);
  return (path) =>
    path in answers
      ? Promise.resolve(answers[path])
      : Promise.reject(new Error(`nothing stubbed for ${path}`));
}

function check(stub: Stub) {
  return checkReview({ pull: stub.pull ?? 552, repository: REPOSITORY, read: reading(stub) });
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

// A full review, the push that dismissed it, and the quick check of that push.
const QUICK_AFTER_FULL = [
  sourcery(REVIEWED, FOUND, "2026-10-05T06:06:37Z", "DISMISSED"),
  sourcery(HEAD, QUICK, "2026-10-05T06:23:07Z", "APPROVED"),
];

describe("checkReview", () => {
  it("passes a head with a full review, and compares nothing", async () => {
    const result = await check({
      reviews: [
        sourcery(REVIEWED, FOUND, "2026-10-05T06:06:37Z"),
        sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z"),
      ],
      runs: [run("success")],
    });

    expect(result).toEqual({
      passed: true,
      lines: ["#552 at f4e9a2d: a full review.", "Check-run: success.", "Enough to hand off."],
    });
  });

  it("fails the quick check when a test changed after the full review", async () => {
    const result = await check({
      reviews: QUICK_AFTER_FULL,
      runs: [run("success")],
      since: {
        status: "ahead",
        files: [
          { filename: "docs/setup/011-branch-protection.md" },
          { filename: "tests/unit/docs/setup-chain.test.ts" },
        ],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lines).toEqual([
      "#552 at f4e9a2d: the quick check only.",
      "Check-run: success.",
      "The last full review was of 797ee79. Changed since then:",
      "  documentation: docs/setup/011-branch-protection.md",
      "  not documentation: tests/unit/docs/setup-chain.test.ts",
      expect.stringMatching(NOT_ENOUGH),
    ]);
  });

  it("fails the quick check when only a comment in source changed", async () => {
    const result = await check({
      reviews: QUICK_AFTER_FULL,
      since: { status: "ahead", files: [{ filename: "src/lib/team-page-context.ts" }] },
    });

    expect(result.passed).toBe(false);
    expect(result.lines).toContain("  not documentation: src/lib/team-page-context.ts");
  });

  it("passes the quick check when only documents changed after the full review", async () => {
    const result = await check({
      reviews: QUICK_AFTER_FULL,
      runs: [run("success")],
      since: { status: "ahead", files: [{ filename: "skills/open-pr.md" }] },
    });

    expect(result).toEqual({
      passed: true,
      lines: [
        "#552 at f4e9a2d: the quick check only.",
        "Check-run: success.",
        "The last full review was of 797ee79. Changed since then:",
        "  documentation: skills/open-pr.md",
        "Enough: nothing but documentation changed since the full review.",
      ],
    });
  });

  it("fails the quick check when source was renamed to a documentation path", async () => {
    const result = await check({
      reviews: QUICK_AFTER_FULL,
      since: {
        status: "ahead",
        files: [{ filename: "docs/form.md", previous_filename: "src/lib/form.ts" }],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lines).toContain("  not documentation: docs/form.md (was src/lib/form.ts)");
  });

  it("fails the quick check that is the only review, as one pull request stood on 2026-10-05", async () => {
    const result = await check({
      head: "304d479000000000000000000000000000000000",
      reviews: [
        sourcery("3890507000000000000000000000000000000000", BUDGET, "2026-10-05T09:23:29Z"),
        sourcery(
          "304d479000000000000000000000000000000000",
          QUICK,
          "2026-10-05T10:16:42Z",
          "APPROVED"
        ),
      ],
      runs: [run("success")],
    });

    expect(result.passed).toBe(false);
    expect(result.lines).toEqual([
      "#552 at 304d479: the quick check only.",
      "Check-run: success.",
      "No full review came before it.",
      expect.stringMatching(NOT_ENOUGH),
    ]);
  });

  it.each(["diverged", "behind", "identical"])(
    "fails the quick check when the head is %s from the reviewed commit, though only documents are listed",
    async (status) => {
      const result = await check({
        reviews: QUICK_AFTER_FULL,
        since: { status, files: [{ filename: "docs/infrastructure.md" }] },
      });

      expect(result.passed).toBe(false);
      expect(result.lines[2]).toBe(
        "The last full review was of 797ee79, and the branch has been rebased since, so what changed cannot be listed."
      );
    }
  );

  it("fails a comparison that reached GitHub's limit, though every listed file is a document", async () => {
    const many = Array.from({ length: 300 }, (_, index) => ({ filename: `docs/${index}.md` }));
    const result = await check({
      reviews: QUICK_AFTER_FULL,
      since: { status: "ahead", files: many },
    });

    expect(result.passed).toBe(false);
    expect(result.lines).toContain("  and possibly more: GitHub lists 300 files of a comparison");
  });

  it("passes the quick check over a comparison with no files at all", async () => {
    // GitHub leaves `files` out of a comparison with nothing in it.
    const result = await check({ reviews: QUICK_AFTER_FULL, since: { status: "ahead" } });

    expect(result.passed).toBe(true);
    expect(result.lines).toContain("  nothing");
  });

  it("does not count a full review of the head that someone dismissed, and says so", async () => {
    const result = await check({
      reviews: [sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z", "DISMISSED")],
      runs: [run("success")],
    });

    expect(result).toEqual({
      passed: false,
      lines: [
        "#552 at f4e9a2d: nothing from Sourcery.",
        "Check-run: success.",
        "A full review of this head was dismissed, and is not counted.",
        expect.stringMatching(NOT_ENOUGH),
      ],
    });
  });

  it("reports a budget notice written as a review of the head", async () => {
    const result = await check({
      reviews: [sourcery(HEAD, BUDGET, "2026-10-05T09:23:29Z")],
      runs: [run("skipped", BUDGET)],
    });

    expect(result.passed).toBe(false);
    expect(result.lines.slice(0, 3)).toEqual([
      "#552 at f4e9a2d: a budget notice, and no review.",
      "Check-run: skipped.",
      "Sorry @someone, this account has used its review budget of 1,500,000 diff characters for the last 7 days.",
    ]);
  });

  it("reports a budget notice that only the skipped check-run carries", async () => {
    const result = await check({ runs: [run("skipped", BUDGET)] });

    expect(result.passed).toBe(false);
    expect(result.lines[0]).toBe("#552 at f4e9a2d: a budget notice, and no review.");
  });

  it("reports a refusal written as a review of the head as a skip", async () => {
    const result = await check({
      reviews: [
        sourcery(HEAD, "Sorry, we are unable to review this pull request", "2026-09-14T09:00:00Z"),
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.lines[0]).toBe("#552 at f4e9a2d: a skip, and no review.");
  });

  it("reports a skipped check-run as a skip, with Sourcery's reason", async () => {
    const result = await check({
      runs: [run("skipped", "This pull request has hit its limit of 5 automatic re-reviews.")],
    });

    expect(result.passed).toBe(false);
    expect(result.lines.slice(0, 3)).toEqual([
      "#552 at f4e9a2d: a skip, and no review.",
      "Check-run: skipped.",
      "This pull request has hit its limit of 5 automatic re-reviews.",
    ]);
  });

  it("fails a head Sourcery wrote nothing about, green check-run or not", async () => {
    const result = await check({
      reviews: [sourcery(REVIEWED, FOUND, "2026-10-05T22:09:01Z")],
      runs: [run("success")],
    });

    expect(result).toEqual({
      passed: false,
      lines: [
        "#552 at f4e9a2d: nothing from Sourcery.",
        "Check-run: success.",
        expect.stringMatching(NOT_ENOUGH),
      ],
    });
  });

  it("fails a pull request with no reviews and no check-run", async () => {
    expect((await check({})).lines).toEqual([
      "#552 at f4e9a2d: nothing from Sourcery.",
      "Check-run: none.",
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

  it("reads every page of check-runs, so Sourcery's run past the first hundred still counts", async () => {
    const others = Array.from({ length: 100 }, (_, index) => ({
      ...run("success", "Another app's", index + 1),
      app: { slug: "github-actions" },
    }));
    const answers = answersFor({ runs: others });
    answers[`${ROOT}/commits/${HEAD}/check-runs?per_page=100&page=2`] = {
      check_runs: [run("skipped", "Skipped.", 500)],
    };

    const result = await checkReview({
      pull: 552,
      repository: REPOSITORY,
      read: (path) =>
        path in answers ? Promise.resolve(answers[path]) : Promise.reject(new Error(path)),
    });

    expect(result.lines[1]).toBe("Check-run: skipped.");
  });

  it("reads every page of reviews, so a review past the first hundred still counts", async () => {
    const replies = Array.from({ length: 100 }, () => ({
      user: null,
      commit_id: HEAD,
      state: "COMMENTED",
      body: null,
      submitted_at: "2026-10-05T07:00:00Z",
    }));
    const answers = answersFor({ reviews: replies });
    answers[`${ROOT}/pulls/552/reviews?per_page=100&page=2`] = [
      sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z"),
    ];

    const result = await checkReview({
      pull: 552,
      repository: REPOSITORY,
      read: (path) =>
        path in answers ? Promise.resolve(answers[path]) : Promise.reject(new Error(path)),
    });

    expect(result.passed).toBe(true);
  });

  it("refuses a review of the head it does not recognise, and does not call it nothing", async () => {
    const stub = {
      reviews: [
        sourcery(HEAD, "### Sourcery assessment\n\n**Changes requested.**", "2026-10-05T07:57:42Z"),
      ],
    };

    await expect(check(stub)).rejects.toThrow("It starts: ### Sourcery assessment");
  });

  it("refuses to report on a head that moved while it was being read", async () => {
    const pushed = "0a1b2c3000000000000000000000000000000000";
    const answers = answersFor({ reviews: [sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z")] });
    let reads = 0;
    const read: ReadJson = (path) => {
      if (path !== `${ROOT}/pulls/552`) return Promise.resolve(answers[path]);
      reads += 1;
      return Promise.resolve({ head: { sha: reads === 1 ? HEAD : pushed } });
    };

    await expect(checkReview({ pull: 552, repository: REPOSITORY, read })).rejects.toThrow(
      "its head moved from f4e9a2d to 0a1b2c3 while it was read"
    );
  });

  it.each([
    ["the head", "../../../orgs/someone", QUICK_AFTER_FULL],
    [
      "a reviewed commit",
      HEAD,
      [
        sourcery("main?per_page=1", FOUND, "2026-10-05T06:06:37Z"),
        sourcery(HEAD, QUICK, "2026-10-05T06:23:07Z"),
      ],
    ],
  ])(
    "refuses an answer in which %s is not a commit id, and asks nothing with it",
    async (_name, head, reviews) => {
      const paths: string[] = [];
      const answers = answersFor({ head: HEAD, reviews });
      answers[`${ROOT}/pulls/552`] = { head: { sha: head } };
      const read: ReadJson = (path) => {
        paths.push(path);
        return Promise.resolve(answers[path]);
      };

      await expect(checkReview({ pull: 552, repository: REPOSITORY, read })).rejects.toThrow(
        "GitHub named a commit that is not one"
      );
      expect(paths.filter((path) => path.includes("orgs") || path.includes("main"))).toEqual([]);
    }
  );
});

describe("runCheck", () => {
  const passing = () =>
    reading({
      pull: 556,
      reviews: [sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z")],
      runs: [run("success")],
    });
  const failing = () => reading({ pull: 556 });

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
  ])("exits 1 with the usage on %s, and reads nothing", async (_name, argv) => {
    const spy = consoleSpy();
    const reader = vi.fn(passing);

    expect(await runCheck(argv, { GH_TOKEN: "token" }, spy, reader)).toBe(1);
    expect(spy.lines.err).toEqual(["Usage: npm run check:sourcery -- <pull request number>"]);
    expect(reader).not.toHaveBeenCalled();
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
    const env = { GH_TOKEN: "", GITHUB_TOKEN: "ci" };

    expect(await runCheck(["node", "script", "556"], env, spy, reader)).toBe(0);
    expect(reader).toHaveBeenCalledWith("ci");
  });

  it("reads the repository the environment names", async () => {
    const spy = consoleSpy();
    const paths: string[] = [];
    const reader = () => (path: string) => {
      paths.push(path);
      return Promise.reject(new Error("stop here"));
    };
    const env = { GH_TOKEN: "token", GITHUB_REPOSITORY: "someone/fork" };

    await runCheck(["node", "script", "7"], env, spy, reader);

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
    const answers = answersFor({
      pull: 556,
      reviews: [sourcery(HEAD, FOUND, "2026-10-05T07:57:42Z")],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const path = String(url).replace("https://api.github.com", "");
      return Promise.resolve(new Response(JSON.stringify(answers[path]), { status: 200 }));
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
