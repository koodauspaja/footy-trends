/**
 * The check behind `npm run check:sourcery`: read a pull request's reviews and
 * the check-run at its head, and say which kind of Sourcery review the head
 * has. The reading is injected, and goes to the API over HTTPS, not through
 * `gh`.
 *
 * decisions/559-sourcery-review-kind.md
 */
import type { Console } from "./issue-boxes-steps";
import {
  type CheckRun,
  COMPARISON_FILE_LIMIT,
  type Comparison,
  fullReviewCommits,
  headReview,
  lastFullReview,
  type Outcome,
  type Report,
  type Review,
  rebasedChanges,
  report,
  type Since,
  SOURCERY_APP,
  sufficient,
  unreviewable,
  withoutReview,
} from "./sourcery-review-plan";

const API = "https://api.github.com";
const PAGE = 100;

/**
 * One JSON answer from the API, however it was fetched.
 *
 * decisions/559-sourcery-review-kind.md
 */
export type ReadJson = (path: string) => Promise<unknown>;

export type CheckOptions = {
  pull: number;
  /** A commit to judge in place of the pull request's head: how it stood then. */
  head?: string | undefined;
  repository: string;
  read: ReadJson;
};

type ApiPull = { head: { sha: string }; base: { sha: string } };
type ApiReview = {
  user: { login: string } | null;
  commit_id: string;
  body: string | null;
  submitted_at: string;
};
type ApiCheckRuns = {
  check_runs: {
    id: number;
    app: { slug: string } | null;
    status: string;
    conclusion: string | null;
    output: { summary: string | null };
  }[];
};
type ApiComparison = {
  status: string;
  files?: { filename: string; patch?: string }[];
};

/**
 * Fetches one JSON answer from the API. A status that is not a success is an
 * error, so an unreadable pull request never reads as one with no review.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function jsonReader(token: string): ReadJson {
  return async (path: string) => {
    const response = await fetch(`${API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub answered ${response.status} for ${path}`);
    }

    return response.json();
  };
}

// Every page: a full one means there may be another behind it.
async function readReviews(
  read: ReadJson,
  repository: string,
  pull: number,
  page = 1
): Promise<Review[]> {
  const rows = (await read(
    `/repos/${repository}/pulls/${pull}/reviews?per_page=${PAGE}&page=${page}`
  )) as ApiReview[];

  const reviews = rows.map((row) => ({
    author: row.user?.login ?? "",
    commit: row.commit_id,
    body: row.body ?? "",
    submittedAt: row.submitted_at,
  }));

  return rows.length < PAGE
    ? reviews
    : [...reviews, ...(await readReviews(read, repository, pull, page + 1))];
}

// Sourcery's latest check-run at the commit: a re-requested review adds a run.
async function readCheck(
  read: ReadJson,
  repository: string,
  head: string
): Promise<CheckRun | undefined> {
  const { check_runs: runs } = (await read(
    `/repos/${repository}/commits/${head}/check-runs?per_page=${PAGE}`
  )) as ApiCheckRuns;

  const latest = runs
    .filter((run) => run.app?.slug === SOURCERY_APP)
    .sort((a, b) => b.id - a.id)[0];

  return (
    latest && {
      status: latest.status,
      conclusion: latest.conclusion,
      summary: latest.output.summary ?? "",
    }
  );
}

async function readComparison(
  read: ReadJson,
  repository: string,
  from: string,
  to: string
): Promise<Comparison> {
  const { status, files = [] } = (await read(
    `/repos/${repository}/compare/${from}...${to}`
  )) as ApiComparison;

  return {
    commit: from,
    status,
    complete: files.length < COMPARISON_FILE_LIMIT,
    changes: files.map((file) => ({ path: file.filename, patch: file.patch })),
  };
}

type Reading = {
  read: ReadJson;
  repository: string;
  head: string;
  /** The tip of the branch the pull request merges into. */
  base: string;
};

// What changed since the last full review. Ahead of it, that is the commits
// in between. Rebased, those include the base branch's, so the pull request's
// own diff then is compared with its own diff now.
async function changesSince(
  reviews: Review[],
  { read, repository, head, base }: Reading
): Promise<Since | undefined> {
  const comparisons = await Promise.all(
    fullReviewCommits(reviews, head).map((commit) => readComparison(read, repository, commit, head))
  );

  const last = lastFullReview(comparisons);
  if (last === undefined) return undefined;

  if (last.status === "ahead") {
    const { commit, complete, changes } = last;
    return { commit, rebased: false, complete, changes };
  }

  const [before, after] = await Promise.all([
    readComparison(read, repository, base, last.commit),
    readComparison(read, repository, base, head),
  ]);

  return {
    commit: last.commit,
    rebased: true,
    complete: before.complete && after.complete,
    changes: rebasedChanges(before.changes, after.changes),
  };
}

/**
 * The whole check, from a pull request number to a report. The pull request's
 * own paths are read only when the review is not enough, to see whether there
 * was anything for Sourcery to review.
 *
 * decisions/559-sourcery-review-kind.md
 */
export async function checkReview({
  pull,
  head: asked,
  repository,
  read,
}: CheckOptions): Promise<Report> {
  const found = (await read(`/repos/${repository}/pulls/${pull}`)) as ApiPull;
  const reading = {
    read,
    repository,
    head: asked ?? found.head.sha,
    base: found.base.sha,
  };
  const { head, base } = reading;

  const [reviews, check] = await Promise.all([
    readReviews(read, repository, pull),
    readCheck(read, repository, head),
  ]);

  const kind = headReview(reviews, head);
  let outcome: Outcome = kind === undefined ? withoutReview(check) : { kind };
  if (outcome.kind === "quick" || outcome.kind === "nothing") {
    outcome = {
      kind: outcome.kind,
      since: await changesSince(reviews, reading),
    };
  }

  const exempt =
    !sufficient(outcome) &&
    unreviewable(
      (await readComparison(read, repository, base, head)).changes.map((change) => change.path)
    );

  return report({ pull, head, outcome, check, exempt });
}

// Decimal digits alone: `Number` would also take `0x10` and `1e2`.
const PULL = /^[1-9]\d*$/;
const COMMIT = /^[0-9a-f]{7,40}$/;

/**
 * The command: arguments and environment in, exit code out. Zero when the
 * head's review is enough to hand the pull request off, and one when it is
 * not or could not be read.
 *
 * decisions/559-sourcery-review-kind.md
 */
export async function runCheck(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  console: Console,
  read: (token: string) => ReadJson = jsonReader
): Promise<number> {
  const pull = PULL.test(argv[2] ?? "") ? Number(argv[2]) : Number.NaN;
  const head = argv[3];
  if (!Number.isSafeInteger(pull) || (head !== undefined && !COMMIT.test(head))) {
    console.err("Usage: npm run check:sourcery -- <pull request number> [<commit>]");
    console.err("  The commit, seven to forty hex digits, judges an earlier head.");
    return 1;
  }

  // `||`, not `??`: an exported but empty `GH_TOKEN` is not a token.
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) {
    console.err("Set GH_TOKEN. With the GitHub CLI already authenticated:");
    console.err(`  GH_TOKEN=$(gh auth token) npm run check:sourcery -- ${pull}`);
    return 1;
  }

  const repository = env.GITHUB_REPOSITORY ?? "koodauspaja/footy-trends";

  try {
    const { passed, lines } = await checkReview({
      pull,
      head,
      repository,
      read: read(token),
    });
    for (const line of lines) (passed ? console.out : console.err)(line);
    return passed ? 0 : 1;
  } catch (error) {
    // A failed read is not a review.
    console.err(`Could not read Sourcery's review of #${pull}: ${(error as Error).message}`);
    return 1;
  }
}

/**
 * The exit code `runWhenMain` sets.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function startCheck(): Promise<number> {
  return runCheck(process.argv, process.env, {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}
