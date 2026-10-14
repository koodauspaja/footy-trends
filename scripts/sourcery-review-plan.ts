/**
 * Which kind of Sourcery review a pull request's head has, and whether that is
 * enough to hand it off. Pure: API answers in, outcome and report out;
 * `sourcery-review-steps.ts` does the reading.
 *
 * decisions/559-sourcery-review-kind.md
 * decisions/597-check-sourcery.md
 * decisions/600-silence-beside-a-green-check.md
 */

/**
 * Sourcery's login on a review, and its app on a check-run.
 *
 * decisions/597-check-sourcery.md
 */
export const SOURCERY_LOGIN = "sourcery-ai[bot]";
export const SOURCERY_APP = "sourcery-ai";

/**
 * GitHub lists at most this many files in one comparison, and says nothing
 * when it stops.
 *
 * decisions/597-check-sourcery.md
 */
export const COMPARISON_FILE_LIMIT = 300;

export type Review = {
  author: string;
  commit: string;
  body: string;
  submittedAt: string;
  dismissed: boolean;
};

export type CheckRun = {
  status: string;
  /** Null until the run completes. */
  conclusion: string | null;
  summary: string;
};

export type Change = {
  path: string;
  /** Where a renamed file was. */
  previousPath: string | undefined;
};

export type Since = {
  /** The commit the last full review was of. */
  commit: string;
  /** Whether the head is ahead of that commit, and not rebased away from it. */
  ahead: boolean;
  /** False when the file list reached GitHub's limit, so more may have changed. */
  complete: boolean;
  changes: Change[];
};

export type ReviewKind = "full" | "quick" | "budget" | "skip";

export type Outcome =
  | { kind: "full" | "budget" | "skip" }
  /** `since` is undefined when no full review came before this head. */
  | { kind: "quick" | "nothing"; since: Since | undefined };

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

// What Sourcery wrote about a commit, oldest first. A reply in a review
// thread is a review with an empty body, and says nothing about the commit.
function written(reviews: readonly Review[], commit: string): Review[] {
  return reviews
    .filter(
      (review) =>
        review.author === SOURCERY_LOGIN && review.commit === commit && review.body.trim() !== ""
    )
    .sort(oldestFirst);
}

/**
 * Whether a full review of the head was dismissed. A push dismisses the
 * reviews of the commit before it, so on the head it is a person's doing.
 *
 * decisions/597-check-sourcery.md
 */
export function dismissedFull(reviews: readonly Review[], head: string): boolean {
  return written(reviews, head).some(
    (review) => review.dismissed && reviewKind(review.body) === "full"
  );
}

/**
 * What Sourcery's standing reviews say about `head`: a full review if there
 * is one, otherwise the latest thing it said, otherwise nothing. A body in no
 * known shape is an error whatever else was written.
 *
 * decisions/597-check-sourcery.md
 */
export function headReview(reviews: readonly Review[], head: string): ReviewKind | undefined {
  const standing = written(reviews, head).filter((review) => !review.dismissed);

  const unknown = standing.find((review) => reviewKind(review.body) === undefined);
  if (unknown) {
    throw new Error(
      `Sourcery's review of ${short(head)} is in no shape this check knows. It starts: ${unknown.body.trim().split("\n")[0]}`
    );
  }

  const kinds = standing.map((review) => reviewKind(review.body));
  return kinds.includes("full") ? "full" : kinds.at(-1);
}

/**
 * The commit other than `head` that Sourcery most recently reviewed in full.
 * Dismissed reviews count: a push dismisses the ones before it.
 *
 * decisions/597-check-sourcery.md
 */
export function lastFullReview(reviews: readonly Review[], head: string): string | undefined {
  return reviews
    .filter(
      (review) =>
        review.author === SOURCERY_LOGIN &&
        review.commit !== head &&
        reviewKind(review.body) === "full"
    )
    .sort(oldestFirst)
    .at(-1)?.commit;
}

const TEST_DIRECTORY = /(?:^|\/)tests\//;
const TEST_FILE = /\.(?:test|spec)\.[^./]+$/;

/**
 * Whether a changed file is documentation: a Markdown file that is not a
 * test and was not renamed from anything. Everything else needs a review, a
 * comment in code included.
 *
 * decisions/597-check-sourcery.md
 */
export function isDocumentation({ path, previousPath }: Change): boolean {
  return (
    previousPath === undefined &&
    path.endsWith(".md") &&
    !TEST_DIRECTORY.test(path) &&
    !TEST_FILE.test(path)
  );
}

/**
 * What a head has when Sourcery wrote no standing review of it: its check-run
 * says whether Sourcery declined, and why.
 *
 * decisions/597-check-sourcery.md
 */
export function withoutReview(check: CheckRun | undefined): "budget" | "skip" | "nothing" {
  if (check?.conclusion !== "skipped") return "nothing";
  return BUDGET_NOTICE.test(check.summary.trim()) ? "budget" : "skip";
}

/**
 * Whether the review is enough: a full review of the head, or nothing but
 * documentation since a full review the head is ahead of, under the quick
 * check or under no review at all beside a green check-run.
 *
 * decisions/597-check-sourcery.md
 * decisions/600-silence-beside-a-green-check.md
 */
export function sufficient({ outcome, check, dismissed }: Judged): boolean {
  // Only the quick check and silence carry what changed since a full review.
  if (!("since" in outcome)) return outcome.kind === "full";
  // Silence stands in for the quick check only when Sourcery's run of the
  // commit finished green, and never over a review of it someone dismissed.
  if (outcome.kind === "nothing" && (check?.conclusion !== "success" || dismissed)) return false;
  if (outcome.since === undefined) return false;

  const { ahead, complete, changes } = outcome.since;
  return ahead && complete && changes.every(isDocumentation);
}

/**
 * How each outcome is named in the report's first line. `skills/open-pr.md`
 * step 7 lists the same five, word for word.
 *
 * decisions/597-check-sourcery.md
 */
export const HEADLINE: Record<Outcome["kind"], string> = {
  full: "a full review",
  quick: "the quick check only",
  budget: "a budget notice, and no review",
  skip: "a skip, and no review",
  nothing: "nothing from Sourcery",
};

function changeLine(change: Change): string {
  const label = isDocumentation(change) ? "documentation" : "not documentation";
  const from = change.previousPath === undefined ? "" : ` (was ${change.previousPath})`;
  return `  ${label}: ${change.path}${from}`;
}

function sinceLines(since: Since | undefined): string[] {
  if (since === undefined) return ["No full review came before it."];

  if (!since.ahead) {
    return [
      `The last full review was of ${short(since.commit)}, and the branch has been rebased since, so what changed cannot be listed.`,
    ];
  }

  return [
    `The last full review was of ${short(since.commit)}. Changed since then:`,
    ...(since.changes.length === 0 ? ["  nothing"] : since.changes.map(changeLine)),
    ...(since.complete
      ? []
      : [`  and possibly more: GitHub lists ${COMPARISON_FILE_LIMIT} files of a comparison`]),
  ];
}

function verdictLine(outcome: Outcome, passed: boolean): string {
  if (outcome.kind === "full") return "Enough to hand off.";
  if (passed) return "Enough: nothing but documentation changed since the full review.";
  return 'Not enough: the head needs a full review, one whose body starts "Hey". skills/open-pr.md step 9 says how to get one.';
}

export type Judged = {
  outcome: Outcome;
  check: CheckRun | undefined;
  /** Whether a full review of the head was left out because it was dismissed. */
  dismissed: boolean;
};

export type ReportInput = Judged & {
  pull: number;
  head: string;
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
 * decisions/597-check-sourcery.md
 */
export function report({ pull, head, outcome, check, dismissed }: ReportInput): Report {
  // A skipped check-run's first line says which limit was hit and when it lifts.
  const reason = check?.conclusion === "skipped" ? check.summary.trim().split("\n")[0] : "";

  const passed = sufficient({ outcome, check, dismissed });

  return {
    passed,
    lines: [
      `#${pull} at ${short(head)}: ${HEADLINE[outcome.kind]}.`,
      `Check-run: ${check ? (check.conclusion ?? check.status) : "none"}.`,
      ...(reason ? [reason] : []),
      ...(dismissed ? ["A full review of this head was dismissed, and is not counted."] : []),
      ...("since" in outcome ? sinceLines(outcome.since) : []),
      verdictLine(outcome, passed),
    ],
  };
}
