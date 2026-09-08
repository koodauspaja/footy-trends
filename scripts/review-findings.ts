/**
 * Counts what code review keeps finding in this repository, by class.
 *
 *   npm run review:findings           # the last 10 merged pull requests
 *   npm run review:findings -- 25     # the last 25
 *
 * Why this exists as a script rather than a paragraph in a document: the tally
 * in `skills/self-review.md` was measured once, on 2026-09-08, and a measurement
 * nobody can repeat becomes folklore the moment the codebase moves. Running
 * this is how that list is kept honest — and how it earns the right to shrink
 * when a class stops appearing.
 *
 * Reads review comments through `gh`, which is already required for every other
 * workflow in this repository, so there is no token to configure and nothing
 * new to keep secret.
 */
import { execFileSync } from "node:child_process";
import { type Finding, format, tally } from "./review-findings-plan";

const out = (line = ""): void => void process.stdout.write(`${line}\n`);
const err = (line = ""): void => void process.stderr.write(`${line}\n`);

/** Enough to see a pattern, few enough that the API calls stay quick. */
const DEFAULT_PULL_COUNT = 10;

/**
 * Sourcery is the reviewer whose findings this counts.
 *
 * Human review comments are deliberately excluded: they arrive as
 * conversation — "why this and not that?" — and are not the same measurement.
 */
const REVIEWER = "sourcery-ai[bot]";

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/** The most recently merged pull requests, newest first. */
function recentPulls(count: number): number[] {
  const json = gh([
    "pr",
    "list",
    "--state",
    "merged",
    "--limit",
    String(count),
    "--json",
    "number",
  ]);
  return (JSON.parse(json) as { number: number }[]).map((pull) => pull.number);
}

function findingsFor(pull: number): Finding[] {
  const json = gh([
    "api",
    `repos/{owner}/{repo}/pulls/${pull}/comments?per_page=100`,
    "--paginate",
  ]);
  const comments = JSON.parse(json) as { user: { login: string }; path: string; body: string }[];

  return comments
    .filter((comment) => comment.user.login === REVIEWER)
    .map((comment) => ({ pull, path: comment.path, body: comment.body }));
}

function main(): void {
  const requested = Number(process.argv[2] ?? DEFAULT_PULL_COUNT);
  const count = Number.isSafeInteger(requested) && requested > 0 ? requested : DEFAULT_PULL_COUNT;

  let pulls: number[];
  try {
    pulls = recentPulls(count);
  } catch (error) {
    // Almost always `gh` missing or unauthenticated, which is worth saying
    // plainly rather than as a stack trace.
    err(`Could not list pull requests: ${error instanceof Error ? error.message : String(error)}`);
    err("This needs the GitHub CLI, authenticated: `gh auth login`.");
    process.exitCode = 1;
    return;
  }

  const findings = pulls.flatMap((pull) => findingsFor(pull));
  out(format(tally(findings), findings.length));
}

main();
