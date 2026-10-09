/**
 * The rule that no checkbox on a pull request's issue is both unticked and
 * unexplained. Pure: text in, verdict out; `issue-boxes-steps.ts` fetches the
 * bodies and decides the exit code.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */

/**
 * The keywords GitHub itself acts on. Matched anywhere in the body, inside
 * backticks or mid-sentence, because that is where GitHub matches them too.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
const CLOSING_KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

/**
 * A list item that is a checkbox: `- [ ]` or `* [x]`, indented or not.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;

/**
 * A fenced code block's delimiter: backticks or tildes, three or more, indented
 * by up to three spaces. A checkbox drawn inside a fence is an example.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Any other list item, which ends the box above it.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
const LIST_ITEM = /^\s*[-*]\s/;

/**
 * An ATX heading, which ends the box above it: up to three spaces of indent,
 * and a space after the hashes, so `#tag` is ordinary text.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;

/**
 * A reason, as the issues that carry one write it: an em dash, then bold. A
 * shape, not a wording.
 *
 * decisions/463-bare-issue-boxes-fail.md
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
 * decisions/463-bare-issue-boxes-fail.md
 */
export function closedIssues(pullBody: string): number[] {
  const found = [...pullBody.matchAll(CLOSING_KEYWORD)].map((match) => Number(match[1]));
  return [...new Set(found)];
}

/**
 * The checkboxes in an issue body, each with the lines that continue it: up to
 * the next box, list item, heading or blank line.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export function boxesIn(issueBody: string): Box[] {
  const boxes: Box[] = [];
  // The box a continuation line would belong to, or `null` when the last line
  // closed it. Tracked, not read back off the end of `boxes`.
  let open: Box | null = null;

  let fenced = false;

  for (const line of issueBody.split("\n")) {
    if (FENCE.test(line)) {
      // A fence both opens and closes, and either way ends the box above it:
      // an example under a criterion is not that criterion's reason.
      fenced = !fenced;
      open = null;
      continue;
    }
    if (fenced) continue;

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

/**
 * The boxes that are neither ticked nor explained.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export function bareBoxes(issueBody: string): Box[] {
  return boxesIn(issueBody).filter((box) => !(box.ticked || box.explained));
}

/**
 * One issue's verdict, ready to print.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export type IssueVerdict = { issue: number; bare: Box[] };

/**
 * What the check says when it fails: which issue, which criteria, and what to
 * do about each. Every bare box is named, not counted.
 *
 * decisions/463-bare-issue-boxes-fail.md
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

/**
 * `a box that is neither ticked nor explained`, in whichever number it is.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
function countOf(bare: readonly Box[]): string {
  const subject = bare.length === 1 ? "a box that is" : `${bare.length} boxes that are`;
  return `${subject} neither ticked nor explained`;
}

/**
 * What to do about a bare box, printed once after the list. It says what a tick
 * means before it asks for one.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
const ADVICE: readonly string[] = [
  "Tick each one it is honest to tick — a box is ticked because the outcome",
  "was verified, not because the code was written. Where a criterion cannot be",
  "ticked honestly, say so on the issue instead, after an em dash and in bold:",
  "",
  "  - [ ] The criterion — **not ticked: it needs a live page, and I have not looked.**",
];

/**
 * What the check prints when nothing is wrong, so a green run still says what
 * it checked.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export function summary(verdicts: readonly IssueVerdict[]): string {
  if (verdicts.length === 0) {
    return "No issue is closed by this pull request, so there are no boxes to check.";
  }

  const issues = verdicts.map(({ issue }) => `#${issue}`).join(", ");
  return `Every checkbox on ${issues} is ticked or carries its reason.`;
}
