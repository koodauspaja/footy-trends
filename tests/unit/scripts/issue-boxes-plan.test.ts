import { describe, expect, it } from "vitest";
import {
  bareBoxes,
  boxesIn,
  closedIssues,
  report,
  summary,
} from "../../../scripts/issue-boxes-plan";

/**
 * The rule from #463: no checkbox on a pull request's issue is both unticked
 * and unexplained.
 *
 * The explained cases are quoted from the issues that actually carry one —
 * #448, #426 and #406 — rather than written to fit the regex. An invented
 * shape would make this file agree with itself and disagree with the
 * repository, which is the one way this check can be wrong and look right.
 */

/** #448, which could not tick a box it had only unit-tested. */
const ISSUE_448 =
  "- [ ] A club with no other stored league season sees `Joukkueelle ei löydy otteluita muilta kausilta.` and the panel still renders — **not ticked: verified by unit test, not on a live page.** See the comment below.";

/** #426, whose reason is a sentence rather than the words "not ticked". */
const ISSUE_426 =
  "- [ ] Each one has its own issue and spec before any code — **the six issues exist; no spec is written yet, which is correct, because no code has started.** Left unticked rather than ticked on half of it.";

/** #406, whose reason wraps onto the next line, as GitHub stores it. */
const ISSUE_406 = [
  "- [ ] `INSTALL.md` (#400) describes both, once it exists — **not done: INSTALL.md",
  "  does not exist yet, so there is nothing to describe them in.**",
].join("\n");

describe("closedIssues", () => {
  it("finds every keyword GitHub itself acts on", () => {
    const body = "Closes #1\nFixes #2\nResolved #3\nfix #4";

    expect(closedIssues(body)).toEqual([1, 2, 3, 4]);
  });

  it("finds one inside backticks and mid-sentence, because GitHub does too", () => {
    // The repository has been caught by exactly this: a closing keyword in
    // prose closes the issue just the same.
    expect(closedIssues("the commit body said `Closes #158` in passing")).toEqual([158]);
  });

  it("names an issue once, however often it is mentioned", () => {
    expect(closedIssues("Closes #7. Fixes #7.")).toEqual([7]);
  });

  it("ignores a bare reference, which closes nothing", () => {
    expect(closedIssues("Part of #9, see also #10")).toEqual([]);
  });

  it("is empty for a pull request with no body at all", () => {
    expect(closedIssues("")).toEqual([]);
  });
});

describe("boxesIn", () => {
  it("reads a ticked box, whichever case the mark is", () => {
    const boxes = boxesIn("- [x] one\n- [X] two");

    expect(boxes.map((box) => box.ticked)).toEqual([true, true]);
    expect(boxes.map((box) => box.text)).toEqual(["one", "two"]);
  });

  it("reads an unticked box as unexplained when it says nothing", () => {
    expect(boxesIn("- [ ] A signed-in reader sees the panels")).toEqual([
      { text: "A signed-in reader sees the panels", ticked: false, explained: false },
    ]);
  });

  /**
   * What counts as a reason, and what does not — one table, because every row
   * asks the same question of a different body and a list of near-identical
   * `it`s hides the shape.
   *
   * The true rows are quoted from the issues that carry a reason (#448, #426,
   * #406) rather than written to fit the regex. The false ones are the two
   * halves of its shape, each of which appears in ordinary criterion text:
   * #467's first box opens with an em dash, and #463's scope bolds a phrase.
   */
  it.each([
    ["#448's em dash and bold", ISSUE_448, true],
    ["#426's reason, which never says the words not ticked", ISSUE_426, true],
    ["#406's reason, wrapped onto the next line", ISSUE_406, true],
    [
      "an em dash alone, as #467's own boxes have",
      "- [ ] Establish the cause rather than assume it — the collision above is a hypothesis",
      false,
    ],
    [
      "bold alone, as #463's scope has",
      "- [ ] A script that, given a PR, **resolves** the issue it closes",
      false,
    ],
    [
      "a paragraph after a blank line",
      "- [ ] bare\n\nA note about the issue — **which is not this box's reason.**",
      false,
    ],
    ["the next heading's text", "- [ ] bare\n## Notes — **not a reason either**", false],
    ["an indented heading, which Markdown allows", "- [ ] bare\n   ## Notes — **no**", false],
    [
      "a hashtag, which is not a heading and must not cut a reason in half",
      "- [ ] bare\n#tag — **and this is the reason.**",
      true,
    ],
  ])("reads %s", (_case, body, explained) => {
    expect(boxesIn(body as string)[0]?.explained).toBe(explained);
  });

  it("does not let the next box's reason explain the one above it", () => {
    const body = `- [ ] bare\n- [ ] explained — **because of this.**`;
    const boxes = boxesIn(body);

    expect(boxes.map((box) => box.explained)).toEqual([false, true]);
  });

  it("does not let a paragraph after a blank line explain a box", () => {
    const body = "- [ ] bare\n\nA note about the issue — **which is not this box's reason.**";

    expect(boxesIn(body)[0]?.explained).toBe(false);
  });

  it("does not let the next heading's text explain a box", () => {
    const body = "- [ ] bare\n## Notes — **not a reason either**";

    expect(boxesIn(body)[0]?.explained).toBe(false);
  });

  it("treats an indented heading as a heading, not as a reason", () => {
    // Markdown allows up to three spaces of indent, and `startsWith("#")` let
    // such a heading's bold text explain the bare box above it.
    const body = "- [ ] bare\n   ## Notes — **not a reason**";

    expect(boxesIn(body)[0]?.explained).toBe(false);
  });

  it("does not mistake a hashtag for a heading, cutting a reason in half", () => {
    // A heading needs a space after its hashes. Without that, a wrapped reason
    // beginning `#tag` was read as a new heading and dropped.
    const body = "- [ ] bare\n#tag — **and this is the reason.**";

    expect(boxesIn(body)[0]?.explained).toBe(true);
  });

  it("finds nothing in a body with no checkboxes", () => {
    expect(boxesIn("## Summary\n\nJust prose, and a - dash.")).toEqual([]);
  });

  it("reads the template's empty boxes, which are bare by construction", () => {
    // `.github/ISSUE_TEMPLATE/feature.md` ships `- [ ]` with no text at all.
    expect(boxesIn("- [ ]\n- [ ]").every((box) => !box.explained)).toBe(true);
  });
});

describe("bareBoxes", () => {
  it("is empty when every box is ticked", () => {
    expect(bareBoxes("- [x] one\n- [x] two")).toEqual([]);
  });

  it("is empty when the one unticked box carries its reason", () => {
    expect(bareBoxes(`- [x] one\n${ISSUE_448}`)).toEqual([]);
  });

  it("names the box that is neither", () => {
    expect(bareBoxes(`- [x] one\n- [ ] two\n${ISSUE_448}`).map((box) => box.text)).toEqual(["two"]);
  });
});

describe("report", () => {
  it("says nothing when nothing is bare", () => {
    expect(report([{ issue: 1, bare: [] }])).toEqual([]);
  });

  it("names the issue, the criterion, and how to satisfy it", () => {
    const lines = report([
      {
        issue: 425,
        bare: [{ text: "Correct in light and dark", ticked: false, explained: false }],
      },
    ]);

    expect(lines[0]).toContain("#425");
    expect(lines[0]).toContain("a box");
    expect(lines.join("\n")).toContain("- [ ] Correct in light and dark");
    // The instruction is the rule itself: verified, not written.
    expect(lines.join("\n")).toContain("verified, not because the code was written");
    expect(lines.join("\n")).toContain("**not ticked:");
  });

  it("counts them when there is more than one", () => {
    const bare = [
      { text: "one", ticked: false, explained: false },
      { text: "two", ticked: false, explained: false },
    ];

    expect(report([{ issue: 1, bare }])[0]).toContain("2 boxes");
  });

  it("names every failing issue, not only the first", () => {
    const bare = [{ text: "one", ticked: false, explained: false }];
    const lines = report([
      { issue: 1, bare },
      { issue: 2, bare: [] },
      { issue: 3, bare },
    ]).join("\n");

    expect(lines).toContain("#1");
    expect(lines).toContain("#3");
    expect(lines).not.toContain("#2");
  });
});

describe("summary", () => {
  it("says what it checked, so a green run is not silent", () => {
    expect(
      summary([
        { issue: 1, bare: [] },
        { issue: 2, bare: [] },
      ])
    ).toBe("Every checkbox on #1, #2 is ticked or carries its reason.");
  });

  it("says so when the pull request closes no issue", () => {
    expect(summary([])).toContain("No issue is closed by this pull request");
  });
});
