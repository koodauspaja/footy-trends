import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { bareBoxes, closedIssues, type IssueVerdict, report } from "../checks/issue-boxes-plan";
import { bodyReader } from "../checks/issue-boxes-steps";
import { type Freshness, freshnessOfCheckout } from "../e2e/e2e-freshness-verdict";
import { executablePath } from "../shared/executable";
import { type Console, processConsole } from "../shared/github-read";
import {
  ADD_EVERYTHING_REFUSAL,
  BARE_BOXES_HEADING,
  type BodySource,
  headRefusal,
  type PullRequestCreate,
  REVIEW_REQUEST,
  type ReviewRequest,
  requestsIn,
  staleRefusal,
  unreadableBodyRefusal,
  unreadIssueRefusal,
} from "./claude-bash-guard-plan";

/**
 * Claude Code's `PreToolUse` hook on the Bash tool: read the command it is
 * about to run, and refuse it, with exit code 2 and the reason on stderr, when
 * it breaks a rule in `claude-bash-guard-plan.ts`.
 *
 * decisions/806-push-and-pr-hooks.md
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */

/**
 * Exit codes Claude Code reads from a hook: 2 blocks the tool call and shows
 * stderr to Claude; 0 lets it run.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export const ALLOW = 0;
export const REFUSE = 2;

/**
 * The reading this hook does, injected.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export type GuardDeps = {
  /** git's trimmed stdout in `cwd`, or `null` when it fails. */
  git: (cwd: string, args: readonly string[]) => string | null;
  /** A file's contents, or `null` when it cannot be read. */
  readFile: (path: string) => string | null;
  /** An issue's body. Rejects when it cannot be read. */
  readIssue: (issue: number) => Promise<string>;
  /** Whether a passing full e2e run vouches for the checkout `cwd` is in. */
  freshness: (cwd: string) => Freshness;
};

/**
 * The commit `gh pr create` would open and what was pushed of it: the
 * checkout's `HEAD`, or the branch `--head` names.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function headState(cwd: string, head: string | null, deps: GuardDeps) {
  if (head !== null) {
    return {
      head: deps.git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${head}`]),
      // git reads `@{upstream}` after a branch name, not after a full ref.
      upstream: deps.git(cwd, ["rev-parse", "--verify", "--quiet", `${head}@{upstream}`]),
      branch: head,
    };
  }
  return {
    head: deps.git(cwd, ["rev-parse", "HEAD"]),
    upstream: deps.git(cwd, ["rev-parse", "--verify", "--quiet", "@{upstream}"]),
    branch: deps.git(cwd, ["symbolic-ref", "--short", "--quiet", "HEAD"]),
  };
}

function bodyText(body: BodySource, deps: GuardDeps): { text: string } | { refusal: string } {
  if (body.kind === "text") return { text: body.text };
  if (body.kind === "unreadable") return { refusal: unreadableBodyRefusal(body.reason) };
  const text = deps.readFile(body.path);
  return text === null
    ? { refusal: unreadableBodyRefusal(`${body.path} cannot be read`) }
    : { text };
}

/**
 * Why an issue could not be read, as a refusal, or its verdict.
 *
 * decisions/806-push-and-pr-hooks.md
 */
async function readVerdict(issue: number, deps: GuardDeps): Promise<IssueVerdict | string> {
  try {
    return { issue, bare: bareBoxes(await deps.readIssue(issue)) };
  } catch (error) {
    return unreadIssueRefusal(issue, error instanceof Error ? error.message : String(error));
  }
}

async function boxRefusals(body: string, deps: GuardDeps): Promise<string[]> {
  // Read together: one issue's answer does not change which others to read.
  const results = await Promise.all(closedIssues(body).map((issue) => readVerdict(issue, deps)));
  const unread = results.filter((result) => typeof result === "string");
  const bare = report(results.filter((result) => typeof result !== "string"));
  return [...unread, ...(bare.length > 0 ? [[BARE_BOXES_HEADING, "", ...bare].join("\n")] : [])];
}

/**
 * The refusal for `action` in `cwd` when no passing full e2e run covers it, or
 * `null`. There is a reason only for a `block`: where e2e cannot run, none.
 *
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
function freshnessRefusal(action: string, cwd: string, deps: GuardDeps): string | null {
  const { reason } = deps.freshness(cwd);
  return reason === null ? null : staleRefusal(action, reason);
}

/**
 * Everything wrong with one `gh pr create`: its head, its e2e run, then its
 * body's boxes.
 *
 * decisions/806-push-and-pr-hooks.md
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
async function pullRequestRefusals(request: PullRequestCreate, deps: GuardDeps): Promise<string[]> {
  if (request.cwd === null) {
    return [
      "Refused: `gh pr create` after a `cd` this hook cannot follow, so it cannot tell which branch it opens. Use an absolute path.",
    ];
  }

  const head = headRefusal(headState(request.cwd, request.head, deps));
  const e2e = freshnessRefusal("`gh pr create`", request.cwd, deps);
  const body = bodyText(request.body, deps);
  const boxes = "text" in body ? await boxRefusals(body.text, deps) : [body.refusal];
  return [...[head, e2e].filter((refusal) => refusal !== null), ...boxes];
}

/**
 * Why a command that asks Sourcery for a review may not run yet, or `null`. A
 * body file that cannot be read asks for nothing this hook can see.
 *
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
function reviewRefusal(request: ReviewRequest, deps: GuardDeps): string | null {
  if (
    request.bodyFile !== null &&
    !(deps.readFile(request.bodyFile) ?? "").includes(REVIEW_REQUEST)
  ) {
    return null;
  }
  if (request.cwd === null) {
    return "Refused: a Sourcery review request after a `cd` this hook cannot follow, so it cannot tell which checkout it is for. Use an absolute path.";
  }
  return freshnessRefusal("asking Sourcery for a review", request.cwd, deps);
}

/**
 * Every refusal a command line earns, run from `cwd`. Empty when it may run.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export async function refusals(command: string, cwd: string, deps: GuardDeps): Promise<string[]> {
  const requests = requestsIn(command, cwd);
  const pullRequests = await Promise.all(
    requests.pullRequests.map((request) => pullRequestRefusals(request, deps))
  );
  const reviews = requests.reviewRequests.flatMap((request) => reviewRefusal(request, deps) ?? []);
  return [
    ...(requests.addsEverything ? [ADD_EVERYTHING_REFUSAL] : []),
    ...pullRequests.flat(),
    ...reviews,
  ];
}

/**
 * The Bash command and directory in a `PreToolUse` hook's input, or `null` for
 * anything else.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function bashCall(input: string): { command: string; cwd: string } | null {
  try {
    const parsed = JSON.parse(input) as {
      tool_name?: unknown;
      tool_input?: { command?: unknown };
      cwd?: unknown;
    };
    const command = parsed.tool_input?.command;
    if (
      parsed.tool_name !== "Bash" ||
      typeof command !== "string" ||
      typeof parsed.cwd !== "string"
    ) {
      return null;
    }
    return { command, cwd: parsed.cwd };
  } catch {
    return null;
  }
}

/**
 * The hook: its stdin in, an exit code out. Input it cannot read lets the
 * command run, and says so: a broken hook must not stop every command.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export async function runGuard(input: string, deps: GuardDeps, console: Console): Promise<number> {
  const call = bashCall(input);
  if (call === null) {
    console.err(
      "claude-bash-guard: the hook input is not a Bash call it can read; the command runs unchecked."
    );
    return ALLOW;
  }

  const found = await refusals(call.command, call.cwd, deps);
  if (found.length === 0) return ALLOW;

  console.err(found.join("\n\n"));
  return REFUSE;
}

function run(binary: string | null, cwd: string, args: readonly string[]): string | null {
  if (binary === null) return null;
  const result = spawnSync(binary, [...args], { cwd, encoding: "utf8", timeout: 15_000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * The token GitHub is read with: the environment's, or the GitHub CLI's own.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function githubToken(
  env: Record<string, string | undefined>,
  ghToken: () => string | null
): string | null {
  // `||`, not `??`: an exported but empty variable is not a token.
  return env.GH_TOKEN || env.GITHUB_TOKEN || ghToken();
}

export function defaultDeps(env: Record<string, string | undefined>): GuardDeps {
  const repository = env.GITHUB_REPOSITORY ?? "koodauspaja/footy-trends";
  return {
    freshness: freshnessOfCheckout,
    git: (cwd, args) => run(executablePath("git"), cwd, args),
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    readIssue: async (issue) => {
      const token = githubToken(env, () =>
        run(executablePath("gh"), process.cwd(), ["auth", "token"])
      );
      if (token === null) throw new Error("no GitHub token: set GH_TOKEN or run gh auth login");
      return bodyReader(token)(`/repos/${repository}/issues/${issue}`);
    },
  };
}

/**
 * The exit code `runWhenMain` sets, which is what Claude Code reads.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function startGuard(): Promise<number> {
  return runGuard(readFileSync(0, "utf8"), defaultDeps(process.env), processConsole());
}
