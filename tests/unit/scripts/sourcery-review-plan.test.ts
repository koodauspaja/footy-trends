import { describe, expect, it } from "vitest";
import {
  type Change,
  type CheckRun,
  changeKind,
  fullReviewCommits,
  headReview,
  lastFullReview,
  type Outcome,
  type Review,
  rebasedChanges,
  report,
  reviewKind,
  type Since,
  sufficient,
  unreviewable,
  withoutReview,
} from "../../../scripts/sourcery-review-plan";

/**
 * The rule behind `npm run check:sourcery`: which kind of review a body is,
 * what a head has, what changed since the last full review, and whether that
 * is enough. The bodies are the ones Sourcery wrote, word for word.
 *
 * decisions/559-sourcery-review-kind.md
 */

const FOUND = "Hey - I've found 2 issues\n\n<details>\n<summary>Prompt for AI Agents</summary>";
const LOOKS_GREAT =
  "Hey - I've reviewed your changes and they look great!\n\n### Sourcery assessment\n\n**Approved.**\n\n***";
const QUICK = "### Sourcery assessment\n\n**Approved.**";
const BUDGET =
  "Sorry @someone, this account has used its review budget of 1,500,000 diff characters for the last 7 days.\n\nYou can request another review in 10 hours and 21 minutes by commenting `@sourcery-ai review`.";

const HEAD = "f4e9a2da8d79ff975d6284198f2d00373a46813b";
const EARLIER = "797ee79000000000000000000000000000000000";

function review(commit: string, body: string, submittedAt: string, author = "sourcery-ai[bot]") {
  return { author, commit, body, submittedAt } satisfies Review;
}

const SUCCESS: CheckRun = { status: "completed", conclusion: "success", summary: "Completed" };

describe("reviewKind", () => {
  it("reads a body that starts with the findings as a full review", () => {
    expect(reviewKind(FOUND)).toBe("full");
  });

  it("reads an approval that starts with the greeting as a full review", () => {
    expect(reviewKind(LOOKS_GREAT)).toBe("full");
  });

  it("reads the bare assessment as the quick check", () => {
    expect(reviewKind(QUICK)).toBe("quick");
    expect(reviewKind(`\n${QUICK}\n`)).toBe("quick");
  });

  it("reads the spent-budget apology as a budget notice", () => {
    expect(reviewKind(BUDGET)).toBe("budget");
  });

  it("does not guess at a body in none of the three shapes", () => {
    expect(reviewKind("### Sourcery assessment\n\n**Changes requested.**")).toBeUndefined();
    expect(reviewKind(`${QUICK}\n\nOne more thing.`)).toBeUndefined();
    expect(reviewKind("")).toBeUndefined();
  });
});

describe("headReview", () => {
  it("is the quick check when that is all Sourcery wrote about the head", () => {
    const reviews = [
      review(EARLIER, FOUND, "2026-10-05T06:06:37Z"),
      review(HEAD, QUICK, "2026-10-05T06:23:07Z"),
    ];

    expect(headReview(reviews, HEAD)).toBe("quick");
  });

  it("is a full review when the head has one, whatever came after it", () => {
    const reviews = [
      review(HEAD, FOUND, "2026-10-09T10:00:00Z"),
      review(HEAD, QUICK, "2026-10-09T10:05:00Z"),
    ];

    expect(headReview(reviews, HEAD)).toBe("full");
  });

  it("is the latest thing said when none of it is a full review", () => {
    // Given out of order: the answer follows the time written, not the position.
    const reviews = [
      review(HEAD, QUICK, "2026-10-05T10:16:42Z"),
      review(HEAD, BUDGET, "2026-10-05T09:23:29Z"),
    ];

    expect(headReview(reviews, HEAD)).toBe("quick");
    expect(headReview([...reviews, review(HEAD, BUDGET, "2026-10-05T11:00:00Z")], HEAD)).toBe(
      "budget"
    );
  });

  it("is nothing when Sourcery only wrote about other commits", () => {
    expect(headReview([review(EARLIER, FOUND, "2026-10-05T06:06:37Z")], HEAD)).toBeUndefined();
  });

  it("ignores a review of the head by anyone else", () => {
    expect(
      headReview([review(HEAD, FOUND, "2026-10-05T06:06:37Z", "a-colleague")], HEAD)
    ).toBeUndefined();
  });

  it("ignores a reply in a thread, which is a review with an empty body", () => {
    const reviews = [
      review(HEAD, QUICK, "2026-10-05T06:23:07Z"),
      review(HEAD, " ", "2026-10-05T06:30:00Z"),
    ];

    expect(headReview(reviews, HEAD)).toBe("quick");
  });

  it("matches an abbreviated commit", () => {
    expect(headReview([review(HEAD, QUICK, "2026-10-05T06:23:07Z")], "f4e9a2d")).toBe("quick");
  });

  it("refuses a review of the head it cannot recognise, and quotes how it starts", () => {
    const reviews = [
      review(HEAD, "A new kind of note\nwith a second line", "2026-10-05T06:23:07Z"),
    ];

    expect(() => headReview(reviews, HEAD)).toThrow(/f4e9a2d.*It starts: A new kind of note$/);
  });

  it("does not mind an unrecognised review beside a full one", () => {
    const reviews = [
      review(HEAD, "A new kind of note", "2026-10-05T06:23:07Z"),
      review(HEAD, FOUND, "2026-10-05T06:24:00Z"),
    ];

    expect(headReview(reviews, HEAD)).toBe("full");
  });
});

describe("fullReviewCommits", () => {
  it("lists the fully reviewed commits, latest review first and each once", () => {
    const reviews = [
      review("aaaaaaa1", FOUND, "2026-10-05T06:00:00Z"),
      review("bbbbbbb2", LOOKS_GREAT, "2026-10-05T07:00:00Z"),
      review("aaaaaaa1", FOUND, "2026-10-05T05:00:00Z"),
      review(HEAD, QUICK, "2026-10-05T08:00:00Z"),
    ];

    expect(fullReviewCommits(reviews, HEAD)).toEqual(["bbbbbbb2", "aaaaaaa1"]);
  });

  it("leaves out quick checks, budget notices and other people's reviews", () => {
    const reviews = [
      review("aaaaaaa1", QUICK, "2026-10-05T06:00:00Z"),
      review("bbbbbbb2", BUDGET, "2026-10-05T06:10:00Z"),
      review("ccccccc3", FOUND, "2026-10-05T06:20:00Z", "a-colleague"),
      review(HEAD, QUICK, "2026-10-05T08:00:00Z"),
    ];

    expect(fullReviewCommits(reviews, HEAD)).toEqual([]);
  });

  it("leaves out a full review written after Sourcery wrote about the head", () => {
    const reviews = [
      review(HEAD, QUICK, "2026-10-05T10:16:42Z"),
      review("ddcfb82", FOUND, "2026-10-05T22:09:01Z"),
    ];

    expect(fullReviewCommits(reviews, HEAD)).toEqual([]);
  });

  it("counts every full review when Sourcery wrote nothing about the head", () => {
    expect(fullReviewCommits([review("ddcfb82", FOUND, "2026-10-05T22:09:01Z")], HEAD)).toEqual([
      "ddcfb82",
    ]);
  });

  it("never lists the head itself", () => {
    expect(fullReviewCommits([review(HEAD, FOUND, "2026-10-05T22:09:01Z")], "f4e9a2d")).toEqual([]);
  });
});

describe("lastFullReview", () => {
  const comparison = (commit: string, status: string) => ({
    commit,
    status,
    complete: true,
    changes: [],
  });

  it("is the latest review the head is ahead of", () => {
    const found = lastFullReview([
      comparison("later", "behind"),
      comparison("b", "ahead"),
      comparison("a", "ahead"),
    ]);

    expect(found?.commit).toBe("b");
  });

  it("prefers a review the head is ahead of to a newer one it was rebased away from", () => {
    expect(
      lastFullReview([comparison("rebased", "diverged"), comparison("a", "ahead")])?.commit
    ).toBe("a");
  });

  it("falls back to a review the branch was rebased away from", () => {
    expect(
      lastFullReview([comparison("later", "behind"), comparison("rebased", "diverged")])?.commit
    ).toBe("rebased");
  });

  it("is nothing when every review is of a later commit", () => {
    expect(lastFullReview([comparison("later", "behind")])).toBeUndefined();
    expect(lastFullReview([])).toBeUndefined();
  });
});

describe("changeKind", () => {
  it("calls a Markdown file documentation, whatever its diff", () => {
    expect(
      changeKind({ path: "docs/setup/011-branch-protection.md", patch: "+const x = 1;" })
    ).toBe("documentation");
    expect(changeKind({ path: "CLAUDE.md" })).toBe("documentation");
  });

  it("calls a reworded line comment comments only", () => {
    const patch = [
      "@@ -25,10 +25,9 @@ export type TeamPageDefaults =",
      "  */",
      " export function seasonCandidate(rawValue: string): number | undefined {",
      "-  // Digits alone are not enough, which `parseWholeNumber` knows: a value past",
      "-  // the column fails at bind time.",
      "+  // `parseWholeNumber` refuses a value past the column as well as one that is",
      "+  // not digits, so neither reaches a query.",
      "   return parseWholeNumber(rawValue) ?? undefined;",
      " }",
    ].join("\n");

    expect(changeKind({ path: "src/lib/team-page-context.ts", patch })).toBe("comments");
  });

  it("calls the inside of a block comment, and a blank line, comments only", () => {
    const patch = [
      "@@ -1,4 +1,5 @@",
      " /**",
      "- * What it was for.",
      "+ * What it is for.",
      "+ *",
      "+",
      "  */",
    ].join("\n");

    expect(changeKind({ path: "src/components/team-page.tsx", patch })).toBe("comments");
  });

  it("calls a changed line of code something else, however many comments surround it", () => {
    const patch = [
      "@@ -1,3 +1,3 @@",
      "-// one",
      "+// two",
      "-const limit = 5;",
      "+const limit = 3;",
    ].join("\n");

    expect(changeKind({ path: "src/lib/form.ts", patch })).toBe("other");
  });

  it.each([
    ["an opened block comment", "+/**"],
    ["a closed block comment", "-  */"],
    ["a type-checker directive", "+// @ts-expect-error"],
    ["a linter directive", "+  // eslint-disable-next-line no-console"],
    ["a coverage directive", "+/* v8 ignore next */"],
    ["a coverage directive on a line comment", "+// v8 ignore next"],
    ["a docblock tag", "+ * @vitest-environment jsdom"],
    ["a generator method", "+  *entries() {"],
  ])("does not call %s a comment", (_name, line) => {
    expect(changeKind({ path: "src/lib/form.ts", patch: `@@ -1 +1 @@\n${line}` })).toBe("other");
  });

  it("calls any change to a test something else, comments included", () => {
    expect(
      changeKind({ path: "tests/unit/lib/form.test.ts", patch: "@@ -1 +1 @@\n+// a note" })
    ).toBe("other");
  });

  it("calls a file that is not script source something else", () => {
    expect(changeKind({ path: ".github/workflows/ci.yml", patch: "@@ -1 +1 @@\n+// a note" })).toBe(
      "other"
    );
    expect(changeKind({ path: "package.json", patch: "@@ -1 +1 @@\n+" })).toBe("other");
  });

  it("calls a source file with no readable diff something else", () => {
    expect(changeKind({ path: "src/lib/form.ts" })).toBe("other");
  });
});

describe("rebasedChanges", () => {
  it("lists nothing when the pull request's own diff is the same after the rebase", () => {
    const diff: Change[] = [
      { path: "src/a.ts", patch: "+one" },
      { path: "docs/b.md", patch: "+two" },
    ];

    expect(
      rebasedChanges(
        diff,
        diff.map((change) => ({ ...change }))
      )
    ).toEqual([]);
  });

  it("lists a file changed differently, one dropped and one added", () => {
    const before: Change[] = [
      { path: "src/a.ts", patch: "+one" },
      { path: "src/dropped.ts", patch: "+x" },
      { path: "src/same.ts", patch: "+s" },
    ];
    const after: Change[] = [
      { path: "src/a.ts", patch: "+two" },
      { path: "src/added.ts", patch: "+y" },
      { path: "src/same.ts", patch: "+s" },
    ];

    expect(rebasedChanges(before, after)).toEqual([
      { path: "src/a.ts" },
      { path: "src/dropped.ts" },
      { path: "src/added.ts" },
    ]);
  });

  it("lists a file with no readable diff on either side, since it cannot be compared", () => {
    expect(rebasedChanges([{ path: "public/logo.png" }], [{ path: "public/logo.png" }])).toEqual([
      { path: "public/logo.png" },
    ]);
  });
});

describe("withoutReview", () => {
  it("is nothing when there is no check-run, or one that did not skip", () => {
    expect(withoutReview(undefined)).toEqual({ kind: "nothing" });
    expect(withoutReview(SUCCESS)).toEqual({ kind: "nothing" });
    expect(withoutReview({ status: "in_progress", conclusion: null, summary: "" })).toEqual({
      kind: "nothing",
    });
  });

  it("is a budget notice when the skipped check-run says the budget is spent", () => {
    expect(withoutReview({ status: "completed", conclusion: "skipped", summary: BUDGET })).toEqual({
      kind: "budget",
    });
  });

  it("is a skip for any other reason the check-run gives", () => {
    const summary = "This pull request has hit its limit of 5 automatic re-reviews.";

    expect(withoutReview({ status: "completed", conclusion: "skipped", summary })).toEqual({
      kind: "skip",
    });
  });
});

const COMMENT_ONLY: Change = { path: "src/lib/form.ts", patch: "@@ -1 +1 @@\n-// one\n+// two" };
const DOCUMENT: Change = { path: "docs/infrastructure.md", patch: "+a line" };
const TEST: Change = { path: "tests/unit/lib/form.test.ts", patch: "+expect(1).toBe(1);" };

function since(changes: Change[], overrides: Partial<Since> = {}): Since {
  return { commit: EARLIER, rebased: false, complete: true, changes, ...overrides };
}

describe("sufficient", () => {
  it("accepts a full review", () => {
    expect(sufficient({ kind: "full" })).toBe(true);
  });

  it("accepts the quick check over comments and documentation alone", () => {
    expect(sufficient({ kind: "quick", since: since([COMMENT_ONLY, DOCUMENT]) })).toBe(true);
    expect(sufficient({ kind: "quick", since: since([]) })).toBe(true);
  });

  it("refuses the quick check when a test or code changed since the full review", () => {
    expect(sufficient({ kind: "quick", since: since([DOCUMENT, TEST]) })).toBe(false);
  });

  it("refuses the quick check when the list of changes may be cut short", () => {
    expect(sufficient({ kind: "quick", since: since([DOCUMENT], { complete: false }) })).toBe(
      false
    );
  });

  it("refuses the quick check when no full review came before it", () => {
    expect(sufficient({ kind: "quick" })).toBe(false);
  });

  it("refuses a head with no review object, even over documentation alone", () => {
    expect(sufficient({ kind: "nothing", since: since([DOCUMENT]) })).toBe(false);
  });

  it("refuses a budget notice and a skip", () => {
    expect(sufficient({ kind: "budget" })).toBe(false);
    expect(sufficient({ kind: "skip" })).toBe(false);
  });
});

describe("unreviewable", () => {
  it("is true of a pull request made of the manifest and the lockfile", () => {
    expect(unreviewable(["package.json", "package-lock.json"])).toBe(true);
    expect(unreviewable(["package-lock.json"])).toBe(true);
  });

  it("is false with one path off the list", () => {
    expect(unreviewable(["package.json", "docs/infrastructure.md"])).toBe(false);
    expect(unreviewable(["apps/package.json"])).toBe(false);
  });

  it("is false of a pull request with no paths at all", () => {
    expect(unreviewable([])).toBe(false);
  });
});

describe("report", () => {
  function reportFor(outcome: Outcome, check: CheckRun | undefined = SUCCESS, exempt = false) {
    return report({ pull: 552, head: HEAD, outcome, check, exempt });
  }

  it("passes a full review, naming the pull request and the head", () => {
    expect(reportFor({ kind: "full" })).toEqual({
      passed: true,
      lines: ["#552 at f4e9a2d: a full review.", "Check-run: success.", "Enough to hand off."],
    });
  });

  it("fails the quick check over a changed test, and lists what changed", () => {
    expect(reportFor({ kind: "quick", since: since([DOCUMENT, TEST]) })).toEqual({
      passed: false,
      lines: [
        "#552 at f4e9a2d: the quick check only.",
        "Check-run: success.",
        "The last full review was of 797ee79. Changed since then:",
        "  documentation: docs/infrastructure.md",
        "  code, test or configuration: tests/unit/lib/form.test.ts",
        'Not enough: the head needs a full review, one whose body starts "Hey". skills/open-pr.md step 9 says how to get one.',
      ],
    });
  });

  it("passes the quick check over a reworded comment", () => {
    const { passed, lines } = reportFor({ kind: "quick", since: since([COMMENT_ONLY]) });

    expect(passed).toBe(true);
    expect(lines).toContain("  comments only: src/lib/form.ts");
    expect(lines.at(-1)).toBe(
      "Enough: nothing but comments and documentation changed since the full review."
    );
  });

  it("says so when the quick check is the only review the pull request has had", () => {
    const { passed, lines } = reportFor({ kind: "quick" });

    expect(passed).toBe(false);
    expect(lines).toContain("No full review came before it.");
  });

  it("says when the branch was rebased, and when nothing changed with it", () => {
    const { passed, lines } = reportFor({ kind: "quick", since: since([], { rebased: true }) });

    expect(passed).toBe(true);
    expect(lines).toContain(
      "The last full review was of 797ee79, and the branch has been rebased since. Changed since then:"
    );
    expect(lines).toContain("  nothing");
  });

  it("says when the list of changes may be cut short", () => {
    const { passed, lines } = reportFor({
      kind: "quick",
      since: since([DOCUMENT], { complete: false }),
    });

    expect(passed).toBe(false);
    expect(lines).toContain("  and possibly more: GitHub lists 300 files of a comparison");
  });

  it("fails a budget notice and quotes when the budget comes back", () => {
    const check = { status: "completed", conclusion: "skipped", summary: BUDGET };
    const { passed, lines } = reportFor({ kind: "budget" }, check);

    expect(passed).toBe(false);
    expect(lines.slice(0, 3)).toEqual([
      "#552 at f4e9a2d: a budget notice, and no review.",
      "Check-run: skipped.",
      "Sorry @someone, this account has used its review budget of 1,500,000 diff characters for the last 7 days.",
    ]);
  });

  it("reports a budget notice that came as a review with no check-run beside it", () => {
    // Passed whole: the helper would put its green check-run in place of none.
    const { lines } = report({
      pull: 552,
      head: HEAD,
      outcome: { kind: "budget" },
      check: undefined,
      exempt: false,
    });

    expect(lines).toEqual([
      "#552 at f4e9a2d: a budget notice, and no review.",
      "Check-run: none.",
      'Not enough: the head needs a full review, one whose body starts "Hey". skills/open-pr.md step 9 says how to get one.',
    ]);
  });

  it("fails a skip and quotes Sourcery's reason", () => {
    const summary = "This pull request has hit its limit of 5 automatic re-reviews.\n\nMore.";
    const { passed, lines } = reportFor(
      { kind: "skip" },
      { status: "completed", conclusion: "skipped", summary }
    );

    expect(passed).toBe(false);
    expect(lines[0]).toBe("#552 at f4e9a2d: a skip, and no review.");
    expect(lines[2]).toBe("This pull request has hit its limit of 5 automatic re-reviews.");
  });

  it("passes a skip when the pull request holds nothing Sourcery reviews", () => {
    const check = { status: "completed", conclusion: "skipped", summary: "" };
    const { passed, lines } = reportFor({ kind: "skip" }, check, true);

    expect(passed).toBe(true);
    expect(lines).toEqual([
      "#552 at f4e9a2d: a skip, and no review.",
      "Check-run: skipped.",
      "Enough: every path in the pull request is one Sourcery does not review (package.json, package-lock.json). Say so in the pull request.",
    ]);
  });

  it("fails a head Sourcery wrote nothing about, and still lists what changed", () => {
    const { passed, lines } = reportFor({ kind: "nothing", since: since([DOCUMENT]) });

    expect(passed).toBe(false);
    expect(lines[0]).toBe("#552 at f4e9a2d: nothing from Sourcery.");
    expect(lines).toContain("  documentation: docs/infrastructure.md");
    expect(lines.at(-1)).toMatch(/^Not enough/);
  });

  it("shows a check-run that has not finished by its status", () => {
    const check = { status: "in_progress", conclusion: null, summary: "" };

    expect(reportFor({ kind: "nothing" }, check).lines[1]).toBe("Check-run: in_progress.");
  });
});
