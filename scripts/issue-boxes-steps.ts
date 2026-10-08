/**
 * The check that runs on a pull request: read its body, read the issues it
 * closes, and fail when a checkbox is neither ticked nor explained. The
 * reading is injected, and goes to the API over HTTPS, not through `gh`.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
import { bareBoxes, closedIssues, type IssueVerdict, report, summary } from "./issue-boxes-plan";

const API = "https://api.github.com";

/**
 * One GitHub body, however it was fetched.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export type ReadBody = (path: string) => Promise<string>;

export type CheckOptions = {
  pull: number;
  repository: string;
  read: ReadBody;
};

export type CheckResult = {
  /** True when nothing is bare — including when no issue is closed at all. */
  passed: boolean;
  lines: string[];
};

/**
 * Fetches one body from the API. Issues and pull requests share the `/issues/`
 * route, so one reader answers both.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export function bodyReader(token: string): ReadBody {
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

    const { body } = (await response.json()) as { body: string | null };
    // An empty body is a body: a pull request with no description closes no
    // issue, which is a pass rather than a failure to read anything.
    return body ?? "";
  };
}

/**
 * The whole check, from a pull request number to a verdict. A pull request
 * that closes no issue passes.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export async function checkBoxes({ pull, repository, read }: CheckOptions): Promise<CheckResult> {
  const pullBody = await read(`/repos/${repository}/issues/${pull}`);
  const issues = closedIssues(pullBody);

  const verdicts: IssueVerdict[] = [];
  for (const issue of issues) {
    const body = await read(`/repos/${repository}/issues/${issue}`);
    verdicts.push({ issue, bare: bareBoxes(body) });
  }

  const lines = report(verdicts);
  return lines.length === 0
    ? { passed: true, lines: [summary(verdicts)] }
    : { passed: false, lines };
}

export type Console = {
  out: (line: string) => void;
  err: (line: string) => void;
};

/**
 * The command: arguments and environment in, exit code out. The pull request
 * number is an argument, so a human can run it on any pull request.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export async function runCheck(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  console: Console,
  read: (token: string) => ReadBody = bodyReader
): Promise<number> {
  const pull = Number(argv[2]);
  if (!Number.isSafeInteger(pull) || pull <= 0) {
    console.err("Usage: npm run check:boxes -- <pull request number>");
    return 1;
  }

  // `||`, not `??`: an exported but empty `GH_TOKEN` is not a token, and
  // nullish coalescing would let it shadow a perfectly good `GITHUB_TOKEN`.
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) {
    console.err("Set GH_TOKEN. With the GitHub CLI already authenticated:");
    console.err("  GH_TOKEN=$(gh auth token) npm run check:boxes -- 464");
    return 1;
  }

  const repository = env.GITHUB_REPOSITORY ?? "koodauspaja/footy-trends";

  try {
    const { passed, lines } = await checkBoxes({ pull, repository, read: read(token) });
    for (const line of lines) (passed ? console.out : console.err)(line);
    return passed ? 0 : 1;
  } catch (error) {
    // A failed read is not a pass. The check exists because nothing failed
    // when the rule was skipped, and an unreachable API is the same silence.
    console.err(`Could not check the boxes on #${pull}: ${(error as Error).message}`);
    return 1;
  }
}

/**
 * The exit code `runWhenMain` sets, which is what makes CI red or green.
 *
 * decisions/463-bare-issue-boxes-fail.md
 */
export function startCheck(): Promise<number> {
  return runCheck(process.argv, process.env, {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}
