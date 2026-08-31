import { spawnSync } from "node:child_process";
import { WATCHED_DIRECTORIES } from "./e2e-freshness-plan";

/**
 * The git side of the freshness marker, shared by the reporter that writes it
 * and the pre-push hook that reads it.
 *
 * Kept apart from `e2e-freshness-plan.ts` so the decisions there stay pure and
 * unit-testable, and apart from the hook so the reporter can reuse it without
 * pulling in the hook's `docker` probe.
 */

function git(args: string[]): string | null {
  const run = spawnSync("git", args, { encoding: "utf8", timeout: 10_000 });
  return run.status === 0 ? run.stdout : null;
}

/** `git rev-parse HEAD`, or `null` outside a repository or before the first commit. */
export function currentHead(): string | null {
  return git(["rev-parse", "HEAD"])?.trim() ?? null;
}

/**
 * Porcelain status lines for the watched paths only, sorted so two runs of the
 * same tree produce the same list regardless of git's ordering.
 */
export function currentStatus(): string[] {
  const out = git(["status", "--porcelain", "--", ...WATCHED_DIRECTORIES]);
  if (out === null) return [];
  return out.split("\n").filter(Boolean).sort();
}

/**
 * Paths that differ between two commits, with their change letters — this is
 * what sees a **deletion**, which a walk of files that exist cannot.
 *
 * `null` when the range cannot be resolved, which happens after a rebase or a
 * force-push discards the commit the marker recorded. That is treated as a
 * change rather than as "nothing changed", so an unresolvable history fails
 * closed.
 */
export function changedBetweenCommits(from: string, to: string): string[] | null {
  if (from === to) return [];
  const out = git(["diff", "--name-status", `${from}..${to}`, "--", ...WATCHED_DIRECTORIES]);
  if (out === null) return null;
  return out.split("\n").filter(Boolean);
}
