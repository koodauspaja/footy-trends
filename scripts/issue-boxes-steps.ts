/**
 * The check that runs on a pull request: read its body, read the issues it
 * closes, and fail when a checkbox is neither ticked nor explained (#463).
 *
 * The rule itself is in `issue-boxes-plan.ts`. What lives here is the part that
 * talks to GitHub and decides an exit code — with the reading injected, so a
 * test exercises the whole sequence without a network.
 *
 * **Reads the API over HTTPS rather than shelling out to `gh`**, for the reason
 * `review-findings.ts` gives: the command a script runs should not depend on
 * what happens to be earliest in someone's `PATH`.
 */
import { bareBoxes, closedIssues, type IssueVerdict, report, summary } from "./issue-boxes-plan";

const API = "https://api.github.com";

/** One GitHub body, however it was fetched. */
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
 * Fetches one body from the API.
 *
 * Issues and pull requests share the `/issues/` route, and a pull request's own
 * body is served there too — so one reader answers both, and the check needs no
 * second shape.
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
 * The whole check, from a pull request number to a verdict.
 *
 * **A pull request that closes no issue passes.** A trivial chore is allowed to
 * have neither issue nor board card (`skills/chore-workflow.md`), and a check
 * that demanded one would be enforcing a rule this repository does not have.
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
 * The command: arguments and environment in, exit code out.
 *
 * The pull request number comes from the argument so a human can run the same
 * check on any pull request, rather than only the one CI happens to be on.
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

  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
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

/** The exit code `runWhenMain` sets, which is what makes CI red or green. */
export function startCheck(): Promise<number> {
  return runCheck(process.argv, process.env, {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}
