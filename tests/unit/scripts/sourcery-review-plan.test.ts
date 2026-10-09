import { describe, expect, it } from "vitest";
import {
  type Change,
  type CheckRun,
  changeKind,
  comparable,
  fullReviewCommits,
  headReview,
  lastFullReview,
  type Outcome,
  type Review,
  rebasedChanges,
  report,
  resolveCommit,
  reviewKind,
  type Since,
  standing,
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
const LATER = "ddcfb82000000000000000000000000000000000";

function review(
  commit: string,
  body: string,
  submittedAt: string,
  { author = "sourcery-ai[bot]", dismissed = false } = {}
): Review {
  return { author, commit, body, submittedAt, dismissed };
}

function change(path: string, extra: Partial<Change> = {}): Change {
  return { path, status: "modified", previousPath: undefined, patch: undefined, ...extra };
}

// A TypeScript file modified in place, with both of its sides.
function source(path: string, before: string, after: string): Change {
  return change(path, { sources: { before, after } });
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

  it("reads any other apology as a skip", () => {
    const body =
      "Sorry, we are unable to review this pull request\n\nThe GitHub API does not allow us to fetch diffs exceeding 20000 lines";

    expect(reviewKind(body)).toBe("skip");
  });

  it("does not guess at a body in no known shape", () => {
    expect(reviewKind("### Sourcery assessment\n\n**Changes requested.**")).toBeUndefined();
    expect(reviewKind(`${QUICK}\n\nOne more thing.`)).toBeUndefined();
    expect(reviewKind("")).toBeUndefined();
  });
});

describe("resolveCommit", () => {
  it("finds the one known commit an abbreviation names, however often it is listed", () => {
    expect(resolveCommit("f4e9a2d", [EARLIER, HEAD, HEAD])).toBe(HEAD);
    expect(resolveCommit(HEAD, [HEAD])).toBe(HEAD);
  });

  it("refuses an abbreviation that names no known commit", () => {
    expect(() => resolveCommit("abc1234", [HEAD, EARLIER])).toThrow(
      "abc1234 names 0 of the commits"
    );
  });

  it("refuses an abbreviation that names two", () => {
    const twin = "f4e9a2d111111111111111111111111111111111";

    expect(() => resolveCommit("f4e9a2d", [HEAD, twin])).toThrow("f4e9a2d names 2 of the commits");
  });
});

describe("standing", () => {
  it("drops a dismissed review of the head, and keeps the rest", () => {
    const dismissedHead = review(HEAD, FOUND, "2026-10-09T10:00:00Z", { dismissed: true });
    const dismissedEarlier = review(EARLIER, FOUND, "2026-10-09T09:00:00Z", { dismissed: true });
    const standingHead = review(HEAD, QUICK, "2026-10-09T10:05:00Z");

    expect(standing([dismissedHead, dismissedEarlier, standingHead], HEAD)).toEqual([
      dismissedEarlier,
      standingHead,
    ]);
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
    const reviews = [review(HEAD, FOUND, "2026-10-05T06:06:37Z", { author: "a-colleague" })];

    expect(headReview(reviews, HEAD)).toBeUndefined();
  });

  it("ignores a reply in a thread, which is a review with an empty body", () => {
    const reviews = [
      review(HEAD, QUICK, "2026-10-05T06:23:07Z"),
      review(HEAD, " ", "2026-10-05T06:30:00Z"),
    ];

    expect(headReview(reviews, HEAD)).toBe("quick");
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
      review("ccccccc3", FOUND, "2026-10-05T06:20:00Z", { author: "a-colleague" }),
      review(HEAD, QUICK, "2026-10-05T08:00:00Z"),
    ];

    expect(fullReviewCommits(reviews, HEAD)).toEqual([]);
  });

  it("counts a full review a later push dismissed", () => {
    const reviews = [
      review(EARLIER, FOUND, "2026-10-05T08:22:00Z", { dismissed: true }),
      review(HEAD, QUICK, "2026-10-05T08:30:16Z"),
    ];

    expect(fullReviewCommits(reviews, HEAD)).toEqual([EARLIER]);
  });

  it("leaves out a full review written after Sourcery wrote about the head", () => {
    const reviews = [
      review(HEAD, QUICK, "2026-10-05T10:16:42Z"),
      review(LATER, FOUND, "2026-10-05T22:09:01Z"),
    ];

    expect(fullReviewCommits(reviews, HEAD)).toEqual([]);
  });

  it("counts every full review when Sourcery wrote nothing about the head", () => {
    expect(fullReviewCommits([review(LATER, FOUND, "2026-10-05T22:09:01Z")], HEAD)).toEqual([
      LATER,
    ]);
  });

  it("never lists the head itself", () => {
    expect(fullReviewCommits([review(HEAD, FOUND, "2026-10-05T22:09:01Z")], HEAD)).toEqual([]);
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
    const found = lastFullReview([comparison("rebased", "diverged"), comparison("a", "ahead")]);

    expect(found?.commit).toBe("a");
  });

  it("falls back to a review the branch was rebased away from", () => {
    const found = lastFullReview([
      comparison("later", "behind"),
      comparison("rebased", "diverged"),
    ]);

    expect(found?.commit).toBe("rebased");
  });

  it("is nothing when every review is of a later commit", () => {
    expect(lastFullReview([comparison("later", "behind")])).toBeUndefined();
    expect(lastFullReview([])).toBeUndefined();
  });
});

describe("comparable", () => {
  it("is true of TypeScript source modified in place", () => {
    expect(comparable(change("src/lib/form.ts"))).toBe(true);
    expect(comparable(change("src/components/team-page.tsx"))).toBe(true);
    expect(comparable(change("scripts/verify.mts"))).toBe(true);
  });

  it("is false of a test, wherever it lives", () => {
    expect(comparable(change("tests/unit/lib/form.test.ts"))).toBe(false);
    expect(comparable(change("src/lib/form.test.ts"))).toBe(false);
    expect(comparable(change("packages/app/tests/helpers.ts"))).toBe(false);
  });

  it("is false of a file that is not TypeScript, or was not modified in place", () => {
    expect(comparable(change("postcss.config.mjs"))).toBe(false);
    expect(comparable(change(".github/workflows/ci.yml"))).toBe(false);
    expect(comparable(change("src/lib/form.ts", { status: "added" }))).toBe(false);
    expect(comparable(change("src/lib/form.ts", { status: "renamed" }))).toBe(false);
  });
});

describe("changeKind", () => {
  it("calls a Markdown file documentation", () => {
    expect(changeKind(change("docs/setup/011-branch-protection.md"))).toBe("documentation");
    expect(changeKind(change("CLAUDE.md", { status: "added" }))).toBe("documentation");
  });

  it("does not call a Markdown file that is a test documentation", () => {
    expect(changeKind(change("tests/fixtures/issue-body.md"))).toBe("other");
    expect(changeKind(change("docs/setup/chain.test.md"))).toBe("other");
    expect(changeKind(change("docs/setup/chain.spec.md"))).toBe("other");
  });

  it("does not call source renamed to a Markdown path documentation", () => {
    const renamed = change("docs/form.md", { status: "renamed", previousPath: "src/lib/form.ts" });

    expect(changeKind(renamed)).toBe("other");
  });

  it("calls a Markdown file renamed from another one documentation", () => {
    const renamed = change("docs/new.md", { status: "renamed", previousPath: "docs/old.md" });

    expect(changeKind(renamed)).toBe("documentation");
  });

  it("calls a reworded line comment and doc comment comments only", () => {
    const before = [
      "/**",
      " * What it was for.",
      " */",
      "export function limit(raw: string): number | undefined {",
      "  // Digits alone are not enough.",
      "  return parse(raw) ?? undefined;",
      "}",
    ].join("\n");
    const after = [
      "/**",
      " * What it is for,",
      " * on two lines.",
      " */",
      "export function limit(raw: string): number | undefined {",
      "",
      "  // `parse` refuses what is not digits.",
      "  return parse(raw) ?? undefined;",
      "}",
    ].join("\n");

    expect(changeKind(source("src/lib/form.ts", before, after))).toBe("comments");
  });

  it.each([
    ["a changed value", "const limit = 5;", "const limit = 3;"],
    [
      "a multiplication carried onto a line that starts like a comment",
      "const y = x\n  * 2;",
      "const y = x\n  * 3;",
    ],
    [
      "a template string line that starts like a comment",
      "const t = `\n// one\n`;",
      "const t = `\n// two\n`;",
    ],
    ["code a block comment now swallows", "/* note */ run();", "/* note run(); */"],
  ])("calls %s something else", (_name, before, after) => {
    expect(changeKind(source("src/lib/form.ts", before, after))).toBe("other");
  });

  it("calls changed text between tags something else, though it starts like a comment", () => {
    const before = "export const a = <p>\n  // beta\n</p>;";
    const after = "export const a = <p>\n  // gamma\n</p>;";

    expect(changeKind(source("src/components/note.tsx", before, after))).toBe("other");
  });

  it.each([
    ["a type-checker directive", "// @ts-expect-error"],
    ["a linter directive", "// eslint-disable-next-line no-console"],
    ["a formatter directive", "// biome-ignore lint/suspicious/noExplicitAny: fixture"],
    ["a coverage directive", "/* v8 ignore next */"],
    ["a scanner directive", "// NOSONAR"],
    ["a test-environment tag", "/** @vitest-environment jsdom */"],
    ["a triple-slash reference", '/// <reference types="next" />'],
  ])("calls %s added above unchanged code something else", (_name, directive) => {
    const before = "run();";

    expect(changeKind(source("src/lib/form.ts", before, `${directive}\n${before}`))).toBe("other");
  });

  it("calls a directive added as the last line of a file something else", () => {
    expect(changeKind(source("src/lib/form.ts", "run();", "run();\n// NOSONAR"))).toBe("other");
  });

  it("calls a directive moved to another line something else", () => {
    const before = "// @ts-expect-error\none();\ntwo();";
    const after = "one();\n// @ts-expect-error\ntwo();";

    expect(changeKind(source("src/lib/form.ts", before, after))).toBe("other");
  });

  it("calls a comment reworded beside an untouched directive comments only", () => {
    const before = "// one\n// @ts-expect-error\nrun();";
    const after = "// two\n// @ts-expect-error\nrun();";

    expect(changeKind(source("src/lib/form.ts", before, after))).toBe("comments");
  });

  it("calls any change to a test something else, comments included", () => {
    expect(changeKind(source("tests/unit/lib/form.test.ts", "// one", "// two"))).toBe("other");
  });

  it("calls a source file whose two sides were not read something else", () => {
    expect(changeKind(change("src/lib/form.ts"))).toBe("other");
  });

  it("calls a file that is not TypeScript something else, whatever was read", () => {
    expect(changeKind(source("postcss.config.mjs", "// one", "// two"))).toBe("other");
    expect(changeKind(change("package.json"))).toBe("other");
  });
});

describe("rebasedChanges", () => {
  it("lists nothing when the pull request's own diff is the same after the rebase", () => {
    const diff = [change("src/a.ts", { patch: "+one" }), change("docs/b.md", { patch: "+two" })];

    expect(
      rebasedChanges(
        diff,
        diff.map((each) => ({ ...each }))
      )
    ).toEqual([]);
  });

  it("lists a file changed differently, one dropped and one added", () => {
    const before = [
      change("src/a.ts", { patch: "+one" }),
      change("src/dropped.ts", { patch: "+x" }),
      change("src/same.ts", { patch: "+s" }),
    ];
    const after = [
      change("src/a.ts", { patch: "+two" }),
      change("src/added.ts", { patch: "+y" }),
      change("src/same.ts", { patch: "+s" }),
    ];

    expect(rebasedChanges(before, after).map((each) => each.path)).toEqual([
      "src/a.ts",
      "src/dropped.ts",
      "src/added.ts",
    ]);
  });

  it("lists a file with no readable diff on either side, since it cannot be compared", () => {
    const image = change("public/logo.png");

    expect(rebasedChanges([image], [image])).toEqual([
      { path: "public/logo.png", previousPath: undefined, patch: undefined, status: "rebased" },
    ]);
  });

  it("lists a file that came from somewhere else after the rebase, and says from where", () => {
    const before = [change("docs/form.md", { patch: "+same" })];
    const after = [change("docs/form.md", { patch: "+same", previousPath: "src/lib/form.ts" })];

    expect(rebasedChanges(before, after)).toEqual([
      {
        path: "docs/form.md",
        previousPath: "src/lib/form.ts",
        patch: undefined,
        status: "rebased",
      },
    ]);
  });

  it("carries no source over, so a rebased file is never comments only", () => {
    const before = [source("src/lib/form.ts", "// one", "// two")];
    const after = [change("src/lib/form.ts", { patch: "+different" })];

    expect(rebasedChanges(before, after).map(changeKind)).toEqual(["other"]);
  });
});

describe("withoutReview", () => {
  it("is nothing when there is no check-run, or one that did not skip", () => {
    expect(withoutReview(undefined)).toBe("nothing");
    expect(withoutReview(SUCCESS)).toBe("nothing");
    expect(withoutReview({ status: "in_progress", conclusion: null, summary: "" })).toBe("nothing");
  });

  it("is a budget notice when the skipped check-run says the budget is spent", () => {
    expect(withoutReview({ status: "completed", conclusion: "skipped", summary: BUDGET })).toBe(
      "budget"
    );
  });

  it("is a skip for any other reason the check-run gives", () => {
    const summary = "This pull request has hit its limit of 5 automatic re-reviews.";

    expect(withoutReview({ status: "completed", conclusion: "skipped", summary })).toBe("skip");
  });
});

const COMMENT_ONLY = source("src/lib/form.ts", "// one\nrun();", "// two\nrun();");
const DOCUMENT = change("docs/infrastructure.md", { patch: "+a line" });
const TEST = change("tests/unit/lib/form.test.ts", { patch: "+expect(1).toBe(1);" });

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
    const cut = since([DOCUMENT], { complete: false });

    expect(sufficient({ kind: "quick", since: cut })).toBe(false);
  });

  it("refuses the quick check when no full review came before it", () => {
    expect(sufficient({ kind: "quick", since: undefined })).toBe(false);
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
  const pull = (changes: Change[], complete = true) => ({
    commit: "base",
    status: "ahead",
    complete,
    changes,
  });

  it("is true of a pull request made of the manifest and the lockfile", () => {
    expect(unreviewable(pull([change("package.json"), change("package-lock.json")]))).toBe(true);
    expect(unreviewable(pull([change("package-lock.json")]))).toBe(true);
  });

  it("is false with one path off the list", () => {
    expect(unreviewable(pull([change("package.json"), change("docs/infrastructure.md")]))).toBe(
      false
    );
    expect(unreviewable(pull([change("apps/package.json")]))).toBe(false);
  });

  it("is false when a listed path came from one that is not", () => {
    const renamed = change("package.json", { status: "renamed", previousPath: "src/lib/form.ts" });

    expect(unreviewable(pull([renamed]))).toBe(false);
  });

  it("is false of a pull request with no paths, or with a list cut short", () => {
    expect(unreviewable(pull([]))).toBe(false);
    expect(unreviewable(pull([change("package.json")], false))).toBe(false);
  });
});

describe("report", () => {
  function reportFor(outcome: Outcome, check: CheckRun = SUCCESS, exempt = false) {
    return report({ pull: 552, head: HEAD, outcome, check, exempt });
  }

  const NOT_ENOUGH =
    'Not enough: the head needs a full review, one whose body starts "Hey". skills/open-pr.md step 9 says how to get one.';

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
        NOT_ENOUGH,
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

  it("says where a renamed file was", () => {
    const renamed = change("docs/form.md", { status: "renamed", previousPath: "src/lib/form.ts" });
    const { lines } = reportFor({ kind: "quick", since: since([renamed]) });

    expect(lines).toContain("  code, test or configuration: docs/form.md (was src/lib/form.ts)");
  });

  it("says so when the quick check is the only review the pull request has had", () => {
    const { passed, lines } = reportFor({ kind: "quick", since: undefined });

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
    const cut = since([DOCUMENT], { complete: false });
    const { passed, lines } = reportFor({ kind: "quick", since: cut });

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
      NOT_ENOUGH,
    ]);
  });

  it("quotes no reason from a check-run that did not skip", () => {
    // The notice came as a review, beside an earlier green check-run.
    expect(reportFor({ kind: "budget" }).lines).toEqual([
      "#552 at f4e9a2d: a budget notice, and no review.",
      "Check-run: success.",
      NOT_ENOUGH,
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
    expect(lines.at(-1)).toBe(NOT_ENOUGH);
  });

  it("shows a check-run that has not finished by its status", () => {
    const check = { status: "in_progress", conclusion: null, summary: "" };

    expect(reportFor({ kind: "nothing", since: undefined }, check).lines[1]).toBe(
      "Check-run: in_progress."
    );
  });
});
