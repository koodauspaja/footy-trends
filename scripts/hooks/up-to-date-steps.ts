import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { executablePath } from "../shared/executable";
import { type Console, processConsole } from "../shared/github-read";
import { type BranchPush, behindRefusal, branchPushes, FETCH_FAILED } from "./up-to-date-plan";

/**
 * The pre-push hook's up-to-date check: fetch `origin/main`, then refuse a
 * branch push whose commit does not contain it. Git is injected.
 *
 * decisions/806-push-and-pr-hooks.md
 */

/**
 * git's exit status and trimmed stdout, or `null` when git cannot be run.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export type Git = (args: readonly string[]) => { status: number; stdout: string } | null;

/**
 * The pushes to check: from the hook's stdin, or the current branch's HEAD when
 * there is no stdin to read, as when the check is run by hand.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function pushesToCheck(stdin: string | null, git: Git): BranchPush[] | null {
  if (stdin !== null && stdin.trim() !== "") return branchPushes(stdin);

  const branch = git(["symbolic-ref", "--short", "--quiet", "HEAD"]);
  const head = git(["rev-parse", "HEAD"]);
  if (branch?.status !== 0 || head?.status !== 0) return [];
  return branchPushes(
    `refs/heads/${branch.stdout} ${head.stdout} refs/heads/${branch.stdout} ${"0".repeat(40)}`
  );
}

/**
 * The whole check, from the hook's stdin to an exit code.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function runCheck(stdin: string | null, git: Git, console: Console): number {
  const pushes = pushesToCheck(stdin, git);
  if (pushes === null) {
    console.err(
      "Up-to-date check skipped: the pushed refs were not in the shape git gives a pre-push hook."
    );
    return 0;
  }
  if (pushes.length === 0) return 0;

  if (git(["fetch", "--quiet", "origin", "main"])?.status !== 0) {
    console.err(FETCH_FAILED);
    return 0;
  }

  // `--is-ancestor` answers 0 for yes and 1 for no; anything else is git
  // failing, which blocks rather than passing a push nothing checked.
  const behind = pushes
    .filter(({ sha }) => git(["merge-base", "--is-ancestor", "origin/main", sha])?.status !== 0)
    .map(({ branch }) => branch);
  if (behind.length === 0) return 0;

  console.err(`\n${behindRefusal(behind)}\n`);
  return 1;
}

/**
 * What git wrote to the hook's stdin, or `null` when there is nothing to read:
 * a terminal, as when the check is run by hand, or stdin unreadable.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function readStdin(stdin: { isTTY?: boolean }): string | null {
  if (stdin.isTTY) return null;
  try {
    return readFileSync(0, "utf8");
  } catch {
    return null;
  }
}

export const defaultGit: Git = (args) => {
  const binary = executablePath("git");
  if (binary === null) return null;
  const result = spawnSync(binary, [...args], { encoding: "utf8", timeout: 30_000 });
  return result.status === null ? null : { status: result.status, stdout: result.stdout.trim() };
};

/**
 * The exit code `runWhenMain` sets, which is what makes git push or not.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function startCheck(stdin: { isTTY?: boolean } = process.stdin): Promise<number> {
  return Promise.resolve(runCheck(readStdin(stdin), defaultGit, processConsole()));
}
