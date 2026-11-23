/**
 * The pre-push hook's entry point: a branch's first push must be covered by a
 * passing e2e run, judged by `e2e-freshness-verdict.ts`; a later push goes
 * through unchecked. Exits non-zero only on a `block`.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/242-freshness-compares-content.md
 * decisions/661-e2e-freshness-skips-documentation.md
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
import { readFileSync } from "node:fs";
import { changedFromMain } from "./e2e-freshness-git";
import { isFirstPush, LATER_PUSH_SKIP, pushedCommits } from "./e2e-freshness-plan";
import { checkoutFreshness, freshnessDeps } from "./e2e-freshness-verdict";

/**
 * Writes a line to stdout, as the backfill scripts do: `noConsole` forbids
 * `console`.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

/**
 * The ref lines git writes to a pre-push hook's stdin, or `null` when there
 * are none to read: run by hand from a terminal, or stdin unreadable.
 *
 * decisions/661-e2e-freshness-skips-documentation.md
 */
function readPushedRefs(): string | null {
  if (process.stdin.isTTY) return null;
  try {
    return readFileSync(0, "utf8");
  } catch {
    return null;
  }
}

/**
 * What the push changes from `origin/main`, or `null` when that cannot be
 * worked out and the full check has to run.
 *
 * decisions/661-e2e-freshness-skips-documentation.md
 */
function changedByPush(refs: string | null): string[] | null {
  if (refs === null) return null;
  const commits = pushedCommits(refs);
  return commits === null ? null : changedFromMain(commits);
}

function main(): void {
  const refs = readPushedRefs();
  if (refs !== null && !isFirstPush(refs)) {
    out(LATER_PUSH_SKIP);
    return;
  }

  const { verdict } = checkoutFreshness(
    process.cwd(),
    changedByPush(refs),
    freshnessDeps(process.cwd())
  );
  if (verdict.kind === "pass") {
    out(verdict.message);
    return;
  }

  err(`\n${verdict.message}\n`);
  if (verdict.kind === "block") {
    process.exitCode = 1;
  }
}

main();
