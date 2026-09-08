/**
 * Counts what code review keeps finding in this repository, by class.
 *
 *   GH_TOKEN=$(gh auth token) npm run review:findings        # last 10 merges
 *   GH_TOKEN=$(gh auth token) npm run review:findings -- 25  # last 25
 *
 * Why this exists as a command rather than a paragraph in a document: the table
 * in `skills/self-review.md` was measured once, on 2026-09-08, and a
 * measurement nobody can repeat becomes folklore the moment the codebase moves.
 * Running this is how that list is kept honest — and how a class earns its
 * removal when it stops appearing.
 *
 * **Reads the API over HTTPS rather than shelling out to `gh`.** Spawning a
 * binary found on `PATH` is a vulnerability Sonar flags and is right to: the
 * command a script runs should not depend on what happens to be earlier in
 * someone's path. `gh auth token` supplies the credential; nothing is stored.
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

/** Enough to see a pattern, few enough that the requests stay quick. */
const DEFAULT_PULL_COUNT = 10;

const REPOSITORY = "koodauspaja/footy-trends";
const API = "https://api.github.com";

/** The API's maximum, so a page count is the fewest requests that can work. */
const PER_PAGE = 100;

/**
 * Enough closed pull requests to find the newest merges among them.
 *
 * Merged and closed-unmerged are one list in the API, so this over-fetches on
 * purpose: asking for exactly `count` closed ones could return `count`
 * abandoned branches and no merges at all.
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

/** Every review comment on one pull request, across as many pages as it has. */
async function commentsFor(pull: number, token: string): Promise<ApiComment[]> {
  const collected: ApiComment[] = [];

  // Paged until a short page arrives. A pull request with more than 100
  // comments is not hypothetical here — #270 had 18 from one reviewer alone,
  // and a busy one carries replies too.
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

  /**
   * One `try` around every request, not just the first. An earlier version
   * guarded the listing and left the per-pull fetches outside, so a token
   * expiring mid-run printed a stack trace and no table — the "failure path
   * dropped" class this command exists to count.
   */
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
