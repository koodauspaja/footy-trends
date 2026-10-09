/**
 * The check behind `npm run check:sourcery`: read a pull request's reviews and
 * the check-run at its head, and say which kind of Sourcery review the head
 * has. The reading is injected.
 *
 * decisions/559-sourcery-review-kind.md
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
  type Change,
  type CheckRun,
  COMPARISON_FILE_LIMIT,
  type Comparison,
  comparable,
  fullReviewCommits,
  headReview,
  lastFullReview,
  type Outcome,
  type Report,
  type Review,
  rebasedChanges,
  report,
  resolveCommit,
  type Since,
  SOURCERY_APP,
  standing,
  sufficient,
  unreviewable,
  withoutReview,
} from "./sourcery-review-plan";

export type CheckOptions = {
  pull: number;
  /** A commit to judge in place of the pull request's head: how it stood then. */
  commit: string | undefined;
  repository: string;
  read: ReadJson;
};

type ApiPull = { head: { sha: string }; base: { sha: string } };
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
type ApiFile = { filename: string; status: string; previous_filename?: string; patch?: string };
type ApiComparison = { status: string; files?: ApiFile[] };
type ApiContent = { encoding: string; content: string };

type Reading = {
  read: ReadJson;
  repository: string;
  pull: number;
};

const COMMIT_ID = /^[0-9a-f]{40}$/;

// A commit id as one segment of a path. Every id here comes out of one of
// GitHub's answers, and an answer that is not an id must not choose the next
// request.
function segment(commit: string): string {
  if (!COMMIT_ID.test(commit)) throw new Error(`GitHub named a commit that is not one: ${commit}`);
  return encodeURIComponent(commit);
}

async function readHead({ read, repository, pull }: Reading): Promise<ApiPull> {
  return (await read(`/repos/${repository}/pulls/${pull}`)) as ApiPull;
}

async function readReviews({ read, repository, pull }: Reading): Promise<Review[]> {
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

// The commits the pull request is made of now. One that was rebased away is
// not among them, and is known only if Sourcery reviewed it.
function readCommits({ read, repository, pull }: Reading): Promise<string[]> {
  return readAll(read, `/repos/${repository}/pulls/${pull}/commits`, (answer) =>
    (answer as { sha: string }[]).map((commit) => commit.sha)
  );
}

// Sourcery's latest check-run at the commit: a re-requested review adds a run.
async function readCheck(
  { read, repository }: Reading,
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

async function readComparison(
  { read, repository }: Reading,
  from: string,
  to: string
): Promise<Comparison> {
  const { status, files = [] } = (await read(
    `/repos/${repository}/compare/${segment(from)}...${segment(to)}`
  )) as ApiComparison;

  return {
    commit: from,
    status,
    complete: files.length < COMPARISON_FILE_LIMIT,
    changes: files.map((file) => ({
      path: file.filename,
      status: file.status,
      previousPath: file.previous_filename,
      patch: file.patch,
    })),
  };
}

// A file as it is at a commit, or nothing when GitHub will not send it whole.
async function readSource(
  { read, repository }: Reading,
  path: string,
  commit: string
): Promise<string | undefined> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const { encoding, content } = (await read(
    `/repos/${repository}/contents/${encoded}?ref=${segment(commit)}`
  )) as ApiContent;

  return encoding === "base64" ? Buffer.from(content, "base64").toString("utf8") : undefined;
}

// Both sides of a file whose comments may be all that changed.
async function withSources(
  reading: Reading,
  change: Change,
  from: string,
  to: string
): Promise<Change> {
  if (!comparable(change)) return change;

  const [before, after] = await Promise.all([
    readSource(reading, change.path, from),
    readSource(reading, change.path, to),
  ]);

  return before === undefined || after === undefined
    ? change
    : { ...change, sources: { before, after } };
}

// What changed since the last full review. Ahead of it, that is the commits
// in between. Rebased, those include the base branch's, so the pull request's
// own diff then is compared with its own diff now.
async function changesSince(
  reading: Reading,
  reviews: Review[],
  head: string,
  base: string
): Promise<Since | undefined> {
  const comparisons = await Promise.all(
    fullReviewCommits(reviews, head).map((commit) => readComparison(reading, commit, head))
  );

  const last = lastFullReview(comparisons);
  if (last === undefined) return undefined;

  if (last.status === "ahead") {
    const changes = await Promise.all(
      last.changes.map((change) => withSources(reading, change, last.commit, head))
    );
    return { commit: last.commit, rebased: false, complete: last.complete, changes };
  }

  const [before, after] = await Promise.all([
    readComparison(reading, base, last.commit),
    readComparison(reading, base, head),
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
 * own paths are read only when the review is not enough, and its head is read
 * again at the end: a push in between leaves a report about the wrong commit.
 *
 * decisions/559-sourcery-review-kind.md
 */
export async function checkReview({
  pull,
  commit,
  repository,
  read,
}: CheckOptions): Promise<Report> {
  const reading = { read, repository, pull };
  const found = await readHead(reading);
  const base = found.base.sha;
  const every = await readReviews(reading);

  const head =
    commit === undefined
      ? found.head.sha
      : resolveCommit(commit, [
          ...every.map((review) => review.commit),
          ...(await readCommits(reading)),
        ]);
  // The present head, however it was named: an earlier one keeps the reviews
  // a later push dismissed.
  const reviews = head === found.head.sha ? standing(every, head) : every;
  const check = await readCheck(reading, head);

  const kind = headReview(reviews, head) ?? withoutReview(check);
  const outcome: Outcome =
    kind === "quick" || kind === "nothing"
      ? { kind, since: await changesSince(reading, reviews, head, base) }
      : { kind };

  const exempt = !sufficient(outcome) && unreviewable(await readComparison(reading, base, head));

  if (commit === undefined) {
    const now = (await readHead(reading)).head.sha;
    if (now !== head) {
      throw new Error(
        `its head moved from ${head.slice(0, 7)} to ${now.slice(0, 7)} while it was read. Run it again`
      );
    }
  }

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
  const commit = argv[3];
  if (!Number.isSafeInteger(pull) || (commit !== undefined && !COMMIT.test(commit))) {
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

  return conclude(console, `Could not read Sourcery's review of #${pull}`, () =>
    checkReview({ pull, commit, repository, read: read(token) })
  );
}

/**
 * The exit code `runWhenMain` sets.
 *
 * decisions/559-sourcery-review-kind.md
 */
export function startCheck(): Promise<number> {
  return runCheck(process.argv, process.env, processConsole());
}
