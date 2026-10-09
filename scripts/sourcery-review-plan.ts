/**
 * Which kind of Sourcery review a pull request's head has, and whether that is
 * enough to hand it off. Pure: API answers in, outcome and report out;
 * `sourcery-review-steps.ts` does the reading.
 *
 * decisions/559-sourcery-review-kind.md
 */

/**
 * Sourcery's login on a review, and its app on a check-run.
 *
 * decisions/559-sourcery-review-kind.md
 */
export const SOURCERY_LOGIN = "sourcery-ai[bot]";
export const SOURCERY_APP = "sourcery-ai";

/**
 * The paths Sourcery has nothing to say about. A pull request made of these
 * alone needs no review; one path off the list and it does.
 *
 * decisions/559-sourcery-review-kind.md
 */
export const UNREVIEWABLE: readonly string[] = ["package.json", "package-lock.json"];

/**
 * GitHub lists at most this many files in one comparison, and says nothing
 * when it stops.
 *
 * decisions/559-sourcery-review-kind.md
 */
export const COMPARISON_FILE_LIMIT = 300;

export type Review = {
  author: string;
  commit: string;
  body: string;
  submittedAt: string;
};

export type CheckRun = {
  status: string;
  /** Null until the run completes. */
  conclusion: string | null;
  summary: string;
};

export type Change = {
  path: string;
  /** Absent for a binary file, a pure rename, or a diff GitHub would not send. */
  patch?: string | undefined;
};

export type Comparison = {
  /** The commit the comparison starts from. */
  commit: string;
  /** GitHub's word for where the head is from there: `ahead`, `diverged`, `behind`. */
  status: string;
  /** False when the file list reached the limit, so more may have changed. */
  complete: boolean;
  changes: Change[];
};

export type ReviewKind = "full" | "quick" | "budget" | "skip";

export type ChangeKind = "documentation" | "comments" | "other";

export type Since = {
  /** The commit the last full review was of. */
  commit: string;
  /** Whether that commit is no longer an ancestor of the head. */
  rebased: boolean;
  complete: boolean;
  changes: Change[];
};

export type Outcome =
  | { kind: "full" | "budget" | "skip" }
  /** `since` is absent when no full review came before this head. */
  | { kind: "quick" | "nothing"; since?: Since | undefined };

const FULL_REVIEW = /^Hey - I['’]ve (?:reviewed|found)\b/;
const QUICK_CHECK = /^### Sourcery assessment\s+\*\*Approved\.\*\*$/;
const BUDGET_NOTICE = /^Sorry\b.*\bhas used its review budget\b/;
// Any other apology: "Sorry, we are unable to review this pull request".
const REFUSAL = /^Sorry\b/;

/**
 * What a Sourcery review body is, read from how it starts: nothing else on the
 * review tells a full review from the quick check after a push.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function reviewKind(body: string): ReviewKind | undefined {
  const text = body.trim();
  if (FULL_REVIEW.test(text)) return "full";
  if (QUICK_CHECK.test(text)) return "quick";
  if (BUDGET_NOTICE.test(text)) return "budget";
  if (REFUSAL.test(text)) return "skip";
  return undefined;
}

function short(commit: string): string {
  return commit.slice(0, 7);
}

function oldestFirst(a: Review, b: Review): number {
  return a.submittedAt.localeCompare(b.submittedAt);
}

/**
 * What Sourcery wrote about `head`, which may be abbreviated: a full review if
 * it ever wrote one, otherwise the latest thing it said, otherwise nothing. A
 * body in no known shape is an error, not a guess.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function headReview(reviews: readonly Review[], head: string): ReviewKind | undefined {
  // A reply in a review thread is a review with an empty body, and says
  // nothing about the head.
  const written = reviews
    .filter(
      (review) =>
        review.author === SOURCERY_LOGIN &&
        review.commit.startsWith(head) &&
        review.body.trim() !== ""
    )
    .sort(oldestFirst);

  const kinds = written.map((review) => reviewKind(review.body));
  if (kinds.includes("full")) return "full";

  const unknown = written.find((review) => reviewKind(review.body) === undefined);
  if (unknown) {
    throw new Error(
      `Sourcery's review of ${short(head)} is in no shape this check knows. It starts: ${unknown.body.trim().split("\n")[0]}`
    );
  }

  return kinds.at(-1);
}

/**
 * The commits other than `head` that got a full review, latest review first
 * and each once. When Sourcery wrote about `head`, only reviews from before
 * that count: a later one is of a later commit.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function fullReviewCommits(reviews: readonly Review[], head: string): string[] {
  const fromSourcery = reviews.filter((review) => review.author === SOURCERY_LOGIN);
  const seen = fromSourcery
    .filter((review) => review.commit.startsWith(head))
    .sort(oldestFirst)
    .at(-1)?.submittedAt;

  const commits = fromSourcery
    .filter(
      (review) =>
        !review.commit.startsWith(head) &&
        reviewKind(review.body) === "full" &&
        (seen === undefined || review.submittedAt < seen)
    )
    .sort(oldestFirst)
    .reverse()
    .map((review) => review.commit);

  return [...new Set(commits)];
}

/**
 * The full review the head builds on, from comparisons given latest review
 * first: one the head is ahead of, or failing that one it has diverged from by
 * a rebase. A review of a commit the head is behind is of something later.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function lastFullReview(comparisons: readonly Comparison[]): Comparison | undefined {
  return (
    comparisons.find((comparison) => comparison.status === "ahead") ??
    comparisons.find((comparison) => comparison.status === "diverged")
  );
}

const COMMENTED_SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const COMMENT_MARKER = /^(?:\/\/(?!\/)|\*(?!\S))\s*/;
const DIRECTIVE = /^(?:@|eslint-|prettier-|biome-|v8 |c8 |istanbul |NOSONAR)/;

// A blank line, a `//` line or the inside of a block comment, and not one a
// tool reads. A line that opens or closes a block comment is not one, nor is
// `///`: either can change what compiles.
function isComment(line: string): boolean {
  const text = line.trim();
  if (text === "") return true;

  const marker = COMMENT_MARKER.exec(text);
  if (marker === null || (text.startsWith("*") && text.includes("*/"))) return false;
  return !DIRECTIVE.test(text.slice(marker[0].length));
}

/**
 * What a changed file is to the review gate: documentation, source whose
 * changed lines are all comments, or anything else. A test is always
 * "anything else", and so is a file whose diff cannot be read.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function changeKind({ path, patch }: Change): ChangeKind {
  if (path.endsWith(".md")) return "documentation";
  if (patch === undefined || path.startsWith("tests/") || !COMMENTED_SOURCE.test(path)) {
    return "other";
  }

  const changed = patch
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .map((line) => line.slice(1));

  return changed.every(isComment) ? "comments" : "other";
}

/**
 * The files whose part in the pull request differs between its own diff
 * `before` a rebase and `after` it. No patch is carried over, so none of them
 * can count as comments only.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function rebasedChanges(before: readonly Change[], after: readonly Change[]): Change[] {
  const was = new Map(before.map((change) => [change.path, change.patch]));
  const now = new Map(after.map((change) => [change.path, change.patch]));

  // A file with no patch on either side is unreadable, so it counts as changed.
  const same = (path: string) => was.get(path) !== undefined && was.get(path) === now.get(path);

  return [...new Set([...was.keys(), ...now.keys()])]
    .filter((path) => !same(path))
    .map((path) => ({ path }));
}

/**
 * The outcome for a head Sourcery wrote no review of: its check-run says
 * whether it declined, and why.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function withoutReview(check: CheckRun | undefined): Outcome {
  if (check?.conclusion !== "skipped") return { kind: "nothing" };
  return { kind: BUDGET_NOTICE.test(check.summary.trim()) ? "budget" : "skip" };
}

/**
 * Whether the review itself is enough: a full review of the head, or the
 * quick check over nothing but comments and documentation since a full one.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function sufficient(outcome: Outcome): boolean {
  if (outcome.kind === "full") return true;
  // With no review object at all, a green check-run does not say Sourcery read
  // the push, so only the quick check can stand in for a full review.
  if (outcome.kind !== "quick" || outcome.since === undefined) return false;

  return (
    outcome.since.complete &&
    outcome.since.changes.every((change) => changeKind(change) !== "other")
  );
}

/**
 * Whether a pull request is made only of paths Sourcery does not review. An
 * empty list is not such a pull request: it is one that could not be read.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function unreviewable(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every((path) => UNREVIEWABLE.includes(path));
}

/**
 * How each outcome is named in the report's first line. `skills/open-pr.md`
 * step 7 lists the same five, word for word.
 *
 * decisions/559-sourcery-review-kind.md
 */
export const HEADLINE: Record<Outcome["kind"], string> = {
  full: "a full review",
  quick: "the quick check only",
  budget: "a budget notice, and no review",
  skip: "a skip, and no review",
  nothing: "nothing from Sourcery",
};

const CHANGE_LABEL: Record<ChangeKind, string> = {
  documentation: "documentation",
  comments: "comments only",
  other: "code, test or configuration",
};

function sinceLines(since: Since | undefined): string[] {
  if (since === undefined) return ["No full review came before it."];

  const rebased = since.rebased ? ", and the branch has been rebased since" : "";
  const changes = since.changes.map(
    (change) => `  ${CHANGE_LABEL[changeKind(change)]}: ${change.path}`
  );

  return [
    `The last full review was of ${short(since.commit)}${rebased}. Changed since then:`,
    ...(changes.length === 0 ? ["  nothing"] : changes),
    ...(since.complete
      ? []
      : [`  and possibly more: GitHub lists ${COMPARISON_FILE_LIMIT} files of a comparison`]),
  ];
}

function verdictLine(outcome: Outcome, exempt: boolean): string {
  if (outcome.kind === "full") return "Enough to hand off.";
  if (sufficient(outcome)) {
    return "Enough: nothing but comments and documentation changed since the full review.";
  }
  if (exempt) {
    return `Enough: every path in the pull request is one Sourcery does not review (${UNREVIEWABLE.join(", ")}). Say so in the pull request.`;
  }
  return 'Not enough: the head needs a full review, one whose body starts "Hey". skills/open-pr.md step 9 says how to get one.';
}

export type ReportInput = {
  pull: number;
  head: string;
  outcome: Outcome;
  check: CheckRun | undefined;
  /** Whether every path in the pull request is on the unreviewable list. */
  exempt: boolean;
};

export type Report = {
  passed: boolean;
  lines: string[];
};

/**
 * What the command prints, and whether it passes: which of the five outcomes
 * the head has, the check-run beside it, what changed since the last full
 * review, and the verdict.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function report({ pull, head, outcome, check, exempt }: ReportInput): Report {
  // A skipped check-run's first line says which limit was hit and when it lifts.
  const reason = check?.conclusion === "skipped" ? check.summary.trim().split("\n")[0] : "";

  return {
    passed: sufficient(outcome) || exempt,
    lines: [
      `#${pull} at ${short(head)}: ${HEADLINE[outcome.kind]}.`,
      `Check-run: ${check ? (check.conclusion ?? check.status) : "none"}.`,
      ...(reason ? [reason] : []),
      ...(outcome.kind === "quick" || outcome.kind === "nothing" ? sinceLines(outcome.since) : []),
      verdictLine(outcome, exempt),
    ],
  };
}
