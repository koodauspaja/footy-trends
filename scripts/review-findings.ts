/**
 * Counts what code review keeps finding in this repository, by class:
 * `GH_TOKEN=$(gh auth token) npm run review:findings -- 25` for the last 25
 * merges, 10 without a number. It reads the API over HTTPS, not through `gh`.
 *
 * decisions/290-review-finding-classes.md
 * decisions/390-review-classes-remeasured.md
 */
import {
  type ApiComment,
  type ApiPull,
  type Finding,
  findingsFrom,
  format,
  mergedPullNumbers,
  tally,
} from "./review-findings-plan";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

/**
 * Enough to see a pattern, few enough that the requests stay quick.
 *
 * decisions/290-review-finding-classes.md
 */
const DEFAULT_PULL_COUNT = 10;

const REPOSITORY = "koodauspaja/footy-trends";
const API = "https://api.github.com";

/**
 * The API's maximum, so a page count is the fewest requests that can work.
 *
 * decisions/290-review-finding-classes.md
 */
const PER_PAGE = 100;

/**
 * Enough closed pull requests to find the newest merges among them. Merged and
 * closed-unmerged are one list in the API, so this over-fetches on purpose.
 *
 * decisions/290-review-finding-classes.md
 */
const CLOSED_PAGES = 3;

async function get<T>(path: string, token: string): Promise<T> {
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
  return (await response.json()) as T;
}

/**
 * Every review comment on one pull request, across as many pages as it has.
 *
 * decisions/290-review-finding-classes.md
 */
async function commentsFor(pull: number, token: string): Promise<ApiComment[]> {
  const collected: ApiComment[] = [];

  // Paged until a short page arrives: a pull request can have more than 100
  // comments.
  for (let page = 1; ; page++) {
    const batch = await get<ApiComment[]>(
      `/repos/${REPOSITORY}/pulls/${pull}/comments?per_page=${PER_PAGE}&page=${page}`,
      token
    );
    collected.push(...batch);
    if (batch.length < PER_PAGE) return collected;
  }
}

async function main(): Promise<void> {
  const requested = Number(process.argv[2] ?? DEFAULT_PULL_COUNT);
  const count = Number.isSafeInteger(requested) && requested > 0 ? requested : DEFAULT_PULL_COUNT;

  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    err("Set GH_TOKEN. With the GitHub CLI already authenticated:");
    err("  GH_TOKEN=$(gh auth token) npm run review:findings");
    process.exitCode = 1;
    return;
  }

  // One `try` around every request, not just the first.
  let findings: Finding[] = [];
  let fetching = "the pull request list";
  try {
    const closed: ApiPull[] = [];
    for (let page = 1; page <= CLOSED_PAGES; page++) {
      const batch = await get<ApiPull[]>(
        `/repos/${REPOSITORY}/pulls?state=closed&per_page=${PER_PAGE}&page=${page}`,
        token
      );
      closed.push(...batch);
      if (batch.length < PER_PAGE) break;
    }

    for (const pull of mergedPullNumbers(closed, count)) {
      fetching = `the comments on #${pull}`;
      findings = [...findings, ...findingsFrom(pull, await commentsFor(pull, token))];
    }
  } catch (error) {
    err(`Could not read ${fetching}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  out(format(tally(findings), findings.length));
}

// The same shape as `backfill.ts` and `verify-sentry.ts`: anything the guards
// inside `main` did not anticipate still leaves a sentence and an exit code
// rather than a stack trace.
main().catch((error: unknown) => {
  err(`Counting review findings failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
