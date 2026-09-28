/**
 * The rule CLAUDE.md states and nothing enforced: **no checkbox on a pull
 * request's issue is both unticked and unexplained** (#463).
 *
 * Not "every box is ticked". A criterion that cannot be ticked honestly is
 * supposed to say so on the issue rather than be left blank, and four issues
 * already do — #448, #426, #406 and #400 all write the reason inline, after an
 * em dash, in bold. So the checkable property is the pair: a bare box is one
 * with neither a tick nor a reason.
 *
 * **Pure.** `issue-boxes-steps.ts` fetches the bodies and decides the exit
 * code; everything here is text in, verdict out, which is what makes the rule
 * testable without a network or a repository.
 *
 * Why a script rather than another paragraph: the rule was already written in
 * the one file loaded every session, and #158 and #425 were both merged and
 * closed with every box empty anyway. Nothing failed when it was skipped.
 */

/**
 * The keywords GitHub itself acts on, and so the ones that say "this pull
 * request completes that issue".
 *
 * Matched anywhere in the body, including inside backticks or mid-sentence,
 * because that is where GitHub matches them too — a `Closes #N` written in
 * prose closes the issue just the same.
 */
const CLOSING_KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

/** A list item that is a checkbox: `- [ ]` or `* [x]`, indented or not. */
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;

/** Any other list item, which ends the box above it. */
const LIST_ITEM = /^\s*[-*]\s/;

/**
 * An ATX heading, which ends the box above it.
 *
 * Markdown allows up to three spaces of indent, and requires a space after the
 * hashes — so `   ## Notes` is a heading and `#tag` is ordinary text. Testing
 * `startsWith("#")` got both wrong in the same line: an indented heading could
 * explain the box above it, and a wrapped reason beginning `#tag` was cut off
 * from the box it belonged to. Raised in review on #468.
 */
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;

/**
 * A reason, as the four issues that carry one write it: an em dash, then bold.
 *
 * Deliberately a shape rather than a wording. `- [ ] … — **not ticked: …**`
 * and `- [ ] … — **the six issues exist; no spec is written yet …**` both
 * count, because insisting on the phrase "not ticked" would reject #426, which
 * is a model of the thing this check wants.
 */
const REASON = /—\s*\*\*[^*]+\*\*/;

export type Box = {
  /** The criterion as written, with its reason if it carries one. */
  text: string;
  ticked: boolean;
  /** Whether an unticked box says why. Always true of a ticked one. */
  explained: boolean;
};

/**
 * Every issue this pull request says it completes, in the order written and
 * each once.
 *
 * Several is ordinary: a pull request may close a feature and a chore at the
 * same time, and each one's boxes are its own.
 */
export function closedIssues(pullBody: string): number[] {
  const found = [...pullBody.matchAll(CLOSING_KEYWORD)].map((match) => Number(match[1]));
  return [...new Set(found)];
}

/**
 * The checkboxes in an issue body, each with the lines that continue it.
 *
 * A box's reason often wraps — GitHub stores the body as typed, and #400's
 * runs onto the next line — so a box is its own line plus everything up to the
 * next box, the next list item, the next heading or a blank line. Reading only
 * the first line would call an explained box bare, which is the one verdict
 * this check must never get wrong.
 */
export function boxesIn(issueBody: string): Box[] {
  const boxes: Box[] = [];
  /**
   * The box a continuation line would belong to, or `null` when the last line
   * closed it.
   *
   * Tracked rather than read back off the end of `boxes`: a blank line ends the
   * item, so a paragraph *after* it belongs to the issue and not to the box
   * above — and reading `boxes.at(-1)` each time let exactly that paragraph
   * explain a bare box.
   */
  let open: Box | null = null;

  for (const line of issueBody.split("\n")) {
    const box = CHECKBOX.exec(line)?.slice(1);
    if (box) {
      const [mark = " ", text = ""] = box;
      const ticked = mark.toLowerCase() === "x";
      open = { text, ticked, explained: ticked || REASON.test(text) };
      boxes.push(open);
      continue;
    }

    // A blank line, a heading or another list item ends the item, and nothing
    // after one can be read as that box's reason.
    if (line.trim() === "" || HEADING.test(line) || LIST_ITEM.test(line)) {
      open = null;
      continue;
    }

    if (open === null) continue;

    open.text = `${open.text} ${line.trim()}`;
    open.explained = open.ticked || REASON.test(open.text);
  }

  return boxes;
}

/** The boxes that are neither ticked nor explained. */
export function bareBoxes(issueBody: string): Box[] {
  return boxesIn(issueBody).filter((box) => !(box.ticked || box.explained));
}

/** One issue's verdict, ready to print. */
export type IssueVerdict = { issue: number; bare: Box[] };

/**
 * What the check says when it fails: which issue, which criteria, and what to
 * do about each.
 *
 * Names every bare box rather than counting them, for the reason
 * `coverage-gaps.ts` names every missing file — a number tells you to go and
 * look, a list tells you where.
 */
export function report(verdicts: readonly IssueVerdict[]): string[] {
  const failing = verdicts.filter((verdict) => verdict.bare.length > 0);
  if (failing.length === 0) return [];

  return [
    ...failing.flatMap(({ issue, bare }) => [
      `Issue #${issue} has ${countOf(bare)}:`,
      ...bare.map((box) => `  - [ ] ${box.text}`),
      "",
    ]),
    ...ADVICE,
  ];
}

/** `a box that is neither ticked nor explained`, in whichever number it is. */
function countOf(bare: readonly Box[]): string {
  const subject = bare.length === 1 ? "a box that is" : `${bare.length} boxes that are`;
  return `${subject} neither ticked nor explained`;
}

/**
 * What to do about a bare box, printed once after the list however many issues
 * the pull request closed.
 *
 * The instruction is the rule itself rather than "tick them": a box ticked to
 * clear a red check is the failure this whole thing exists to catch, so the
 * message says what a tick means before it asks for one.
 */
const ADVICE: readonly string[] = [
  "Tick each one it is honest to tick — a box is ticked because the outcome",
  "was verified, not because the code was written. Where a criterion cannot be",
  "ticked honestly, say so on the issue instead, after an em dash and in bold:",
  "",
  "  - [ ] The criterion — **not ticked: it needs a live page, and I have not looked.**",
];

/** What the check prints when nothing is wrong, so a green run still says what it checked. */
export function summary(verdicts: readonly IssueVerdict[]): string {
  if (verdicts.length === 0) {
    return "No issue is closed by this pull request, so there are no boxes to check.";
  }

  const issues = verdicts.map(({ issue }) => `#${issue}`).join(", ");
  return `Every checkbox on ${issues} is ticked or carries its reason.`;
}
