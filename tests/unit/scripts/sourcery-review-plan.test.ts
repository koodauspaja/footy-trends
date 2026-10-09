import { describe, expect, it } from "vitest";
import {
  type Change,
  type CheckRun,
  dismissedFull,
  headReview,
  isDocumentation,
  lastFullReview,
  type Outcome,
  type Review,
  report,
  reviewKind,
  type Since,
  sufficient,
  withoutReview,
} from "../../../scripts/sourcery-review-plan";

/**
 * The rule behind `npm run check:sourcery`: which kind of review a body is,
 * what a head has, and whether that is enough. The bodies are the ones
 * Sourcery wrote, word for word.
 *
 * decisions/597-check-sourcery.md
 */

const FOUND = "Hey - I've found 2 issues\n\n<details>\n<summary>Prompt for AI Agents</summary>";
const LOOKS_GREAT =
  "Hey - I've reviewed your changes and they look great!\n\n### Sourcery assessment\n\n**Approved.**\n\n***";
const QUICK = "### Sourcery assessment\n\n**Approved.**";
const BUDGET =
  "Sorry @someone, this account has used its review budget of 1,500,000 diff characters for the last 7 days.\n\nYou can request another review in 10 hours and 21 minutes.";

const HEAD = "f4e9a2da8d79ff975d6284198f2d00373a46813b";
const EARLIER = "797ee79000000000000000000000000000000000";

function review(
  commit: string,
  body: string,
  submittedAt: string,
  { author = "sourcery-ai[bot]", dismissed = false } = {}
): Review {
  return { author, commit, body, submittedAt, dismissed };
}

function change(path: string, previousPath?: string): Change {
  return { path, previousPath };
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
    expect(reviewKind("Sorry, we are unable to review this pull request\n\nToo large.")).toBe(
      "skip"
    );
  });

  it("does not guess at a body in no known shape", () => {
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

  it("does not count a full review of the head that was dismissed", () => {
    const reviews = [
      review(HEAD, FOUND, "2026-10-09T10:00:00Z", { dismissed: true }),
      review(HEAD, QUICK, "2026-10-09T10:05:00Z"),
    ];

    expect(headReview(reviews, HEAD)).toBe("quick");
    expect(headReview(reviews.slice(0, 1), HEAD)).toBeUndefined();
  });

  it("refuses a review of the head it cannot recognise, and quotes how it starts", () => {
    const reviews = [
      review(HEAD, "A new kind of note\nwith a second line", "2026-10-05T06:23:07Z"),
    ];

    expect(() => headReview(reviews, HEAD)).toThrow(/f4e9a2d.*It starts: A new kind of note$/);
  });

  it("refuses it even beside a full review", () => {
    const reviews = [
      review(HEAD, FOUND, "2026-10-05T06:24:00Z"),
      review(HEAD, "A new kind of note", "2026-10-05T06:25:00Z"),
    ];

    expect(() => headReview(reviews, HEAD)).toThrow("in no shape this check knows");
  });
});

describe("dismissedFull", () => {
  it("is true when a full review of the head was dismissed", () => {
    expect(
      dismissedFull([review(HEAD, FOUND, "2026-10-09T10:00:00Z", { dismissed: true })], HEAD)
    ).toBe(true);
  });

  it("is false for a dismissed quick check, a standing review, or another commit's", () => {
    const reviews = [
      review(HEAD, QUICK, "2026-10-09T10:00:00Z", { dismissed: true }),
      review(HEAD, FOUND, "2026-10-09T10:05:00Z"),
      review(EARLIER, FOUND, "2026-10-09T09:00:00Z", { dismissed: true }),
    ];

    expect(dismissedFull(reviews, HEAD)).toBe(false);
  });
});

describe("lastFullReview", () => {
  it("is the commit Sourcery most recently reviewed in full, other than the head", () => {
    const reviews = [
      review("bbbbbbb2", LOOKS_GREAT, "2026-10-05T07:00:00Z"),
      review("aaaaaaa1", FOUND, "2026-10-05T06:00:00Z"),
      review(HEAD, FOUND, "2026-10-05T08:00:00Z"),
    ];

    expect(lastFullReview(reviews, HEAD)).toBe("bbbbbbb2");
  });

  it("counts a full review a later push dismissed", () => {
    const reviews = [
      review(EARLIER, FOUND, "2026-10-05T08:22:00Z", { dismissed: true }),
      review(HEAD, QUICK, "2026-10-05T08:30:16Z"),
    ];

    expect(lastFullReview(reviews, HEAD)).toBe(EARLIER);
  });

  it("is nothing when only quick checks, notices and other people's reviews came before", () => {
    const reviews = [
      review("aaaaaaa1", QUICK, "2026-10-05T06:00:00Z"),
      review("bbbbbbb2", BUDGET, "2026-10-05T06:10:00Z"),
      review("ccccccc3", FOUND, "2026-10-05T06:20:00Z", { author: "a-colleague" }),
      review(HEAD, QUICK, "2026-10-05T08:00:00Z"),
    ];

    expect(lastFullReview(reviews, HEAD)).toBeUndefined();
  });
});

describe("isDocumentation", () => {
  it("is true of a Markdown file changed in place", () => {
    expect(isDocumentation(change("docs/setup/011-branch-protection.md"))).toBe(true);
    expect(isDocumentation(change("CLAUDE.md"))).toBe(true);
  });

  it("is false of source, whatever changed in it", () => {
    expect(isDocumentation(change("src/lib/team-page-context.ts"))).toBe(false);
    expect(isDocumentation(change("package.json"))).toBe(false);
    expect(isDocumentation(change("docs/notes.mdx"))).toBe(false);
  });

  it("is false of a Markdown file that is a test or a fixture", () => {
    expect(isDocumentation(change("tests/fixtures/issue-body.md"))).toBe(false);
    expect(isDocumentation(change("packages/app/tests/notes.md"))).toBe(false);
    expect(isDocumentation(change("docs/setup/chain.test.md"))).toBe(false);
    expect(isDocumentation(change("docs/setup/chain.spec.md"))).toBe(false);
  });

  it("is false of a Markdown file renamed from anything, another document included", () => {
    expect(isDocumentation(change("docs/form.md", "src/lib/form.ts"))).toBe(false);
    expect(isDocumentation(change("docs/new.md", "docs/old.md"))).toBe(false);
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

const DOCUMENT = change("docs/infrastructure.md");
const SOURCE = change("src/lib/form.ts");

function since(changes: Change[], overrides: Partial<Since> = {}): Since {
  return { commit: EARLIER, ahead: true, complete: true, changes, ...overrides };
}

describe("sufficient", () => {
  function enough(outcome: Outcome, check: CheckRun | undefined = SUCCESS, dismissed = false) {
    return sufficient({ outcome, check, dismissed });
  }

  it("accepts a full review", () => {
    expect(enough({ kind: "full" })).toBe(true);
  });

  it("accepts the quick check over documentation alone, or over nothing", () => {
    expect(enough({ kind: "quick", since: since([DOCUMENT]) })).toBe(true);
    expect(enough({ kind: "quick", since: since([]) })).toBe(true);
  });

  it("refuses the quick check when anything else changed since the full review", () => {
    expect(enough({ kind: "quick", since: since([DOCUMENT, SOURCE]) })).toBe(false);
  });

  it("refuses the quick check when the list of changes may be cut short", () => {
    expect(enough({ kind: "quick", since: since([DOCUMENT], { complete: false }) })).toBe(false);
  });

  it("refuses the quick check when the branch was rebased since the full review", () => {
    expect(enough({ kind: "quick", since: since([DOCUMENT], { ahead: false }) })).toBe(false);
  });

  it("refuses the quick check when no full review came before it", () => {
    expect(enough({ kind: "quick", since: undefined })).toBe(false);
  });

  it("accepts no review at all beside a green check-run, over documentation alone", () => {
    expect(enough({ kind: "nothing", since: since([DOCUMENT]) })).toBe(true);
  });

  it("refuses no review at all when anything else changed, green check-run or not", () => {
    expect(enough({ kind: "nothing", since: since([DOCUMENT, SOURCE]) })).toBe(false);
  });

  it.each([
    ["there is no check-run", undefined],
    ["the check-run has not finished", { status: "in_progress", conclusion: null, summary: "" }],
    ["the check-run failed", { status: "completed", conclusion: "failure", summary: "" }],
  ])("refuses no review at all over documentation alone when %s", (_name, check) => {
    // Passed whole: the helper would put its green check-run in place of none.
    const outcome: Outcome = { kind: "nothing", since: since([DOCUMENT]) };

    expect(sufficient({ outcome, check, dismissed: false })).toBe(false);
  });

  it("refuses no review at all when a full review of the head was dismissed", () => {
    expect(enough({ kind: "nothing", since: since([DOCUMENT]) }, SUCCESS, true)).toBe(false);
  });

  it("refuses no review at all when it cannot say what changed", () => {
    expect(enough({ kind: "nothing", since: undefined })).toBe(false);
    expect(enough({ kind: "nothing", since: since([DOCUMENT], { ahead: false }) })).toBe(false);
    expect(enough({ kind: "nothing", since: since([DOCUMENT], { complete: false }) })).toBe(false);
  });

  it("refuses a budget notice and a skip", () => {
    expect(enough({ kind: "budget" })).toBe(false);
    expect(enough({ kind: "skip" })).toBe(false);
  });
});

describe("report", () => {
  function reportFor(outcome: Outcome, check: CheckRun = SUCCESS, dismissed = false) {
    return report({ pull: 552, head: HEAD, outcome, check, dismissed });
  }

  const NOT_ENOUGH =
    'Not enough: the head needs a full review, one whose body starts "Hey". skills/open-pr.md step 9 says how to get one.';

  it("passes a full review, naming the pull request and the head", () => {
    expect(reportFor({ kind: "full" })).toEqual({
      passed: true,
      lines: ["#552 at f4e9a2d: a full review.", "Check-run: success.", "Enough to hand off."],
    });
  });

  it("fails the quick check over changed source, and lists what changed", () => {
    expect(reportFor({ kind: "quick", since: since([DOCUMENT, SOURCE]) })).toEqual({
      passed: false,
      lines: [
        "#552 at f4e9a2d: the quick check only.",
        "Check-run: success.",
        "The last full review was of 797ee79. Changed since then:",
        "  documentation: docs/infrastructure.md",
        "  not documentation: src/lib/form.ts",
        NOT_ENOUGH,
      ],
    });
  });

  it("passes the quick check over documentation alone", () => {
    const { passed, lines } = reportFor({ kind: "quick", since: since([DOCUMENT]) });

    expect(passed).toBe(true);
    expect(lines.at(-1)).toBe("Enough: nothing but documentation changed since the full review.");
  });

  it("passes the quick check when nothing changed, and says so", () => {
    const { passed, lines } = reportFor({ kind: "quick", since: since([]) });

    expect(passed).toBe(true);
    expect(lines).toContain("  nothing");
  });

  it("says where a renamed file was", () => {
    const renamed = change("docs/form.md", "src/lib/form.ts");
    const { lines } = reportFor({ kind: "quick", since: since([renamed]) });

    expect(lines).toContain("  not documentation: docs/form.md (was src/lib/form.ts)");
  });

  it("says so when the quick check is the only review the pull request has had", () => {
    const { passed, lines } = reportFor({ kind: "quick", since: undefined });

    expect(passed).toBe(false);
    expect(lines).toContain("No full review came before it.");
  });

  it("fails a branch rebased since its full review, and lists no files", () => {
    const rebased = since([DOCUMENT], { ahead: false });

    expect(reportFor({ kind: "quick", since: rebased })).toEqual({
      passed: false,
      lines: [
        "#552 at f4e9a2d: the quick check only.",
        "Check-run: success.",
        "The last full review was of 797ee79, and the branch has been rebased since, so what changed cannot be listed.",
        NOT_ENOUGH,
      ],
    });
  });

  it("says when the list of changes may be cut short", () => {
    const cut = since([DOCUMENT], { complete: false });
    const { passed, lines } = reportFor({ kind: "quick", since: cut });

    expect(passed).toBe(false);
    expect(lines).toContain("  and possibly more: GitHub lists 300 files of a comparison");
  });

  it("fails a budget notice and quotes when the budget comes back", () => {
    const check = { status: "completed", conclusion: "skipped", summary: BUDGET };

    expect(reportFor({ kind: "budget" }, check).lines).toEqual([
      "#552 at f4e9a2d: a budget notice, and no review.",
      "Check-run: skipped.",
      "Sorry @someone, this account has used its review budget of 1,500,000 diff characters for the last 7 days.",
      NOT_ENOUGH,
    ]);
  });

  it("quotes no reason from a check-run that did not skip, or when there is none", () => {
    expect(reportFor({ kind: "budget" }).lines).toEqual([
      "#552 at f4e9a2d: a budget notice, and no review.",
      "Check-run: success.",
      NOT_ENOUGH,
    ]);

    const none = report({
      pull: 552,
      head: HEAD,
      outcome: { kind: "nothing", since: undefined },
      check: undefined,
      dismissed: false,
    });
    expect(none.lines).toEqual([
      "#552 at f4e9a2d: nothing from Sourcery.",
      "Check-run: none.",
      "No full review came before it.",
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

  it("says when a full review of the head was dismissed", () => {
    const silent: Outcome = { kind: "nothing", since: since([DOCUMENT]) };
    const { passed, lines } = reportFor(silent, SUCCESS, true);

    expect(passed).toBe(false);
    expect(lines).toEqual([
      "#552 at f4e9a2d: nothing from Sourcery.",
      "Check-run: success.",
      "A full review of this head was dismissed, and is not counted.",
      "The last full review was of 797ee79. Changed since then:",
      "  documentation: docs/infrastructure.md",
      NOT_ENOUGH,
    ]);
  });

  it("passes no review at all beside a green check-run, over documentation alone", () => {
    expect(reportFor({ kind: "nothing", since: since([DOCUMENT]) })).toEqual({
      passed: true,
      lines: [
        "#552 at f4e9a2d: nothing from Sourcery.",
        "Check-run: success.",
        "The last full review was of 797ee79. Changed since then:",
        "  documentation: docs/infrastructure.md",
        "Enough: nothing but documentation changed since the full review.",
      ],
    });
  });

  it("shows a check-run that has not finished by its status", () => {
    const check = { status: "in_progress", conclusion: null, summary: "" };

    const { passed, lines } = reportFor({ kind: "nothing", since: since([DOCUMENT]) }, check);

    expect(passed).toBe(false);
    expect(lines[1]).toBe("Check-run: in_progress.");
  });
});
