import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { processPhrase, refusal, subjectOf } from "../../../../scripts/hooks/commit-subject-plan";

/**
 * Which commit subjects name the review instead of the change: the ones on
 * pull request branches that started this, the six on `main` from before
 * squash merges, and every other subject `main` holds, which must pass.
 *
 * decisions/841-commit-subject-gate.md
 */

/** Every subject on `main` when the rule was written, newest first. */
const MAIN_SUBJECTS = readFileSync("tests/unit/scripts/hooks/main-subjects.txt", "utf8")
  .split("\n")
  .filter(Boolean);

/** The subjects on `main` that name the review, from before squash merges. */
const OLD_OFFENDERS = [
  "refactor: remove duplicate/unused TASO cache TTL constants, addressing Sourcery review on PR #121",
  "refactor: address Sourcery review on PR #120",
  "refactor: extract shared resolveBasePageContext, addressing Sourcery review",
  "docs: fix awkward wording per Sourcery review",
  "fix: address Sourcery review findings on PR #55",
  "chore: address review feedback for CI, logging, and tests",
];

describe("processPhrase", () => {
  it("passes every subject on main except the six that name the review", () => {
    const refused = MAIN_SUBJECTS.filter((subject) => processPhrase(subject) !== null);

    expect(MAIN_SUBJECTS.length).toBeGreaterThan(600);
    expect(refused.sort()).toEqual([...OLD_OFFENDERS].sort());
  });

  it("passes the subjects that mention Sourcery, a review or an answer without naming the review", () => {
    for (const subject of [
      "chore: check:sourcery says which kind of Sourcery review a head has (#597) (#598)",
      "fix: a table TASO serves as unplayed is answered with our own (#628) (#630)",
      "chore: the review rules let any document quote Finnish UI copy, as CLAUDE.md does (#732)",
      "chore: a UX sweep of every page, its findings filed, and skills/ui-review.md to keep pages in shape (#695) (#704)",
    ]) {
      expect(processPhrase(subject), subject).toBeNull();
    }
  });

  it("refuses the subjects on branches that started this", () => {
    expect(processPhrase("chore: answer Sourcery's first review (#806)")).toBe(
      "answer Sourcery's first review"
    );
    expect(processPhrase("chore: answer Sourcery's second review (#806)")).toBe(
      "answer Sourcery's second review"
    );
    expect(processPhrase("chore: answer Sourcery's first review (#807)")).not.toBeNull();
  });

  it.each([
    ["chore: address review comments", "address review"],
    ["chore: addressed the feedback from Kalle", "addressed the feedback"],
    ["fix: responding to Sonar findings", "responding to Sonar findings"],
    ["chore: reply to review suggestions", "reply to review"],
    ["fix: fix review findings", "fix review findings"],
    ["fix: fixes the Sourcery comments", "fixes the Sourcery comments"],
    ["chore: fixed SonarCloud issues", "fixed SonarCloud issues"],
    ["chore: apply suggestions", "apply suggestions"],
    ["chore: applying Sourcery's suggestions", "applying Sourcery's suggestions"],
    ["chore: apply the code review suggestion", "apply the code review suggestion"],
    ["chore: review round 2", "review round"],
    ["docs: tighten wording per the review", "per the review"],
    ["docs: tighten wording per code review", "per code review"],
    ["docs: tighten wording per SonarCloud review", "per SonarCloud review"],
    ["fix: fix findings from Sourcery review", "fix findings from Sourcery review"],
    ["fix: fixes the comments of the code review", "fixes the comments of the code review"],
    ["fix: fix Sourcery's findings", "fix Sourcery's findings"],
    ["chore: apply Sourcery review suggestions", "apply Sourcery review suggestions"],
    ["chore: apply the review's suggestions", "apply the review's suggestions"],
    ["chore: apply SonarCloud's suggestions", "apply SonarCloud's suggestions"],
    ["chore: applied review suggestions", "applied review suggestions"],
    ["chore: answer Sourcery", "answer Sourcery"],
    ["chore: address SonarCloud", "address SonarCloud"],
    ["chore: reply to the reviewer", "reply to the reviewer"],
  ])("refuses %j, naming %j", (subject, phrase) => {
    expect(processPhrase(subject)).toBe(phrase);
  });

  it("passes a subject that says what changed", () => {
    expect(processPhrase("chore: the Bash hook catches gh -R and git add * (#806)")).toBeNull();
    expect(processPhrase("fix: the answer key is read once (#1)")).toBeNull();
    expect(
      processPhrase("chore: answers come from the cache, and the comments table is dropped (#2)")
    ).toBeNull();
    expect(
      processPhrase("fix: address the cup forecast's tie order, and drop stale comments (#3)")
    ).toBeNull();
    expect(processPhrase("chore: address book caching and comments are kept (#4)")).toBeNull();
    expect(processPhrase("fix: answers stay cached \u2014 comments load later (#5)")).toBeNull();
    expect(processPhrase("fix: review round-trip parsing of dates (#6)")).toBeNull();
  });
});

describe("subjectOf", () => {
  it("reads the first line that is not blank, trimmed, above git's comments", () => {
    expect(subjectOf("\n  chore: x (#1)  \n\nbody\n# Please enter\n")).toBe("chore: x (#1)");
  });

  it("keeps a first line that starts with #, as git commit -m does", () => {
    expect(subjectOf("# answer the review comments\n")).toBe("# answer the review comments");
  });

  it("is empty for a blank message", () => {
    expect(subjectOf("\n  \n")).toBe("");
  });
});

describe("refusal", () => {
  it("names each subject, its commit and the words, and says what to write instead", () => {
    const text = refusal([
      {
        commit: "a".repeat(40),
        subject: "chore: answer the review (#1)",
        phrase: "answer the review",
      },
      { commit: null, subject: "chore: apply suggestions", phrase: "apply suggestions" },
    ]);

    expect(text).toContain("2 commit subjects name the review");
    expect(text).toContain('  aaaaaaa chore: answer the review (#1)  ("answer the review")');
    expect(text).toContain('  chore: apply suggestions  ("apply suggestions")');
    expect(text).toContain("Say what the commit changes");
  });

  it("speaks of one subject in the singular", () => {
    expect(refusal([{ commit: null, subject: "x", phrase: "y" }])).toContain(
      "a commit subject names"
    );
  });
});
