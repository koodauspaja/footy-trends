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

  it("takes an em dash and bold as the reason, as #448 writes it", () => {
    expect(boxesIn(ISSUE_448)[0]?.explained).toBe(true);
  });

  it("takes a reason that never says the words not ticked, as #426 writes it", () => {
    expect(boxesIn(ISSUE_426)[0]?.explained).toBe(true);
  });

  it("reads a reason that wraps onto the next line, as #406 stores it", () => {
    // Reading only the first line would call this bare, which is the one
    // verdict the check must never get wrong.
    expect(boxesIn(ISSUE_406)[0]?.explained).toBe(true);
  });

  it("does not take an em dash alone as a reason, as #467's own boxes show", () => {
    /**
     * Criterion text contains em dashes routinely — #467 opens with one — so
     * the dash cannot be the marker. The **bold** is, and without this the
     * check would pass every issue whose scope happens to be written with a
     * dash in it.
     */
    const body =
      "- [ ] Establish the cause rather than assume it — the collision above is a hypothesis";

    expect(boxesIn(body)[0]?.explained).toBe(false);
  });

  it("does not take bold alone as a reason either", () => {
    // Bold appears inside criteria too: #463's own scope bolds a phrase.
    const body = "- [ ] A script that, given a PR, **resolves** the issue it closes";

    expect(boxesIn(body)[0]?.explained).toBe(false);
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
