/**
 * The check behind `npm run check:sourcery`: read a pull request's reviews and
 * the check-run at its head, and say which kind of Sourcery review the head
 * has. The reading is injected.
 *
 * decisions/597-check-sourcery.md
 * decisions/600-silence-beside-a-green-check.md
 */
import {
  type Console,
  conclude,
  jsonReader,
  processConsole,
  type ReadJson,
  readAll,
} from "./github-read";
import {
  type CheckRun,
  COMPARISON_FILE_LIMIT,
  dismissedFull,
  headReview,
  lastFullReview,
  type Outcome,
  type Report,
  type Review,
  report,
  type Since,
  SOURCERY_APP,
  withoutReview,
} from "./sourcery-review-plan";

export type CheckOptions = {
  pull: number;
  repository: string;
  read: ReadJson;
};

type ApiReview = {
  user: { login: string } | null;
  commit_id: string;
  state: string;
  body: string | null;
  submitted_at: string;
};
type ApiCheckRun = {
  id: number;
  app: { slug: string } | null;
  status: string;
  conclusion: string | null;
  output: { summary: string | null };
};
type ApiComparison = {
  status: string;
  files?: { filename: string; previous_filename?: string }[];
};

const COMMIT_ID = /^[0-9a-f]{40}$/;

// A commit id as one segment of a path. Every id here comes out of one of
// GitHub's answers, and an answer that is not an id must not choose the next
// request.
function segment(commit: string): string {
  if (!COMMIT_ID.test(commit)) throw new Error(`GitHub named a commit that is not one: ${commit}`);
  return encodeURIComponent(commit);
}

async function readHead({ read, repository, pull }: CheckOptions): Promise<string> {
  const { head } = (await read(`/repos/${repository}/pulls/${pull}`)) as { head: { sha: string } };
  return head.sha;
}

async function readReviews({ read, repository, pull }: CheckOptions): Promise<Review[]> {
  const rows = await readAll(
    read,
    `/repos/${repository}/pulls/${pull}/reviews`,
    (answer) => answer as ApiReview[]
  );

  return rows.map((row) => ({
    author: row.user?.login ?? "",
    commit: row.commit_id,
    body: row.body ?? "",
    submittedAt: row.submitted_at,
    dismissed: row.state === "DISMISSED",
  }));
}

// Sourcery's latest check-run at the commit: a re-requested review adds a run.
async function readCheck(
  { read, repository }: CheckOptions,
  commit: string
): Promise<CheckRun | undefined> {
  const runs = await readAll(
    read,
    `/repos/${repository}/commits/${segment(commit)}/check-runs`,
    (answer) => (answer as { check_runs: ApiCheckRun[] }).check_runs
  );

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

// What changed between the last full review and the head. Anything but
// "ahead" means the reviewed commit is no ancestor of the head, and the files
// GitHub lists then are not what the pull request changed.
async function readSince(
  { read, repository }: CheckOptions,
  reviewed: string,
  head: string
): Promise<Since> {
  const { status, files = [] } = (await read(
    `/repos/${repository}/compare/${segment(reviewed)}...${segment(head)}`
  )) as ApiComparison;

  return {
    commit: reviewed,
    ahead: status === "ahead",
    complete: files.length < COMPARISON_FILE_LIMIT,
    changes: files.map((file) => ({ path: file.filename, previousPath: file.previous_filename })),
  };
}

/**
 * The whole check, from a pull request number to a report. The head is read
 * again at the end: a push in between leaves a report about the wrong commit.
 *
 * decisions/597-check-sourcery.md
 */
export async function checkReview(options: CheckOptions): Promise<Report> {
  const head = await readHead(options);
  const [reviews, check] = await Promise.all([readReviews(options), readCheck(options, head)]);

  const kind = headReview(reviews, head) ?? withoutReview(check);
  const reviewed = lastFullReview(reviews, head);
  let outcome: Outcome;
  if (kind === "quick" || kind === "nothing") {
    const since = reviewed === undefined ? undefined : await readSince(options, reviewed, head);
    outcome = { kind, since };
  } else outcome = { kind };

  const now = await readHead(options);
  if (now !== head) {
    throw new Error(
      `its head moved from ${head.slice(0, 7)} to ${now.slice(0, 7)} while it was read. Run it again`
    );
  }

  return report({
    pull: options.pull,
    head,
    outcome,
    check,
    dismissed: dismissedFull(reviews, head),
  });
}

// Decimal digits alone: `Number` would also take `0x10` and `1e2`.
const PULL = /^[1-9]\d*$/;

/**
 * The command: arguments and environment in, exit code out. Zero when the
 * head's review is enough to hand the pull request off, and one when it is
 * not or could not be read.
 *
 * decisions/597-check-sourcery.md
 */
export async function runCheck(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  console: Console,
  read: (token: string) => ReadJson = jsonReader
): Promise<number> {
  const pull = PULL.test(argv[2] ?? "") ? Number(argv[2]) : Number.NaN;
  if (!Number.isSafeInteger(pull)) {
    console.err("Usage: npm run check:sourcery -- <pull request number>");
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

  return conclude(console, `Could not read Sourcery's review of #${pull}`, () =>
    checkReview({ pull, repository, read: read(token) })
  );
}

/**
 * The exit code `runWhenMain` sets.
 *
 * decisions/597-check-sourcery.md
 */
export function startCheck(): Promise<number> {
  return runCheck(process.argv, process.env, processConsole());
}
