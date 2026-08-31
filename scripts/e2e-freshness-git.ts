import { spawnSync } from "node:child_process";
import { WATCHED_DIRECTORIES } from "./e2e-freshness-plan";

/**
 * The git side of the freshness marker, shared by the reporter that writes it
 * and the pre-push hook that reads it.
 *
 * Kept apart from `e2e-freshness-plan.ts` so the decisions there stay pure and
 * unit-testable, and apart from the hook so the reporter can reuse it without
 * pulling in the hook's `docker` probe.
 *
 * Every function returns `null` when git cannot answer. That distinction is
 * load-bearing: an empty list and a failed command look identical otherwise,
 * and "git failed" would read as "the tree is clean" — the check would pass
 * having verified nothing.
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
 * Content hashes for paths, in the order given. A path that does not exist —
 * a deletion — hashes as `-`, which is a change like any other.
 */
function hashObjects(paths: string[]): string[] | null {
  if (paths.length === 0) return [];
  const hashes: string[] = [];
  for (const file of paths) {
    const out = git(["hash-object", "--", file]);
    hashes.push(out === null ? "-" : out.trim());
  }
  return hashes;
}

/**
 * The state of every changed watched path: status code, **content hash**, and
 * path, sorted so the same tree always produces the same list.
 *
 * The hash is what makes this correct. Comparing porcelain lines alone missed
 * a file that was already dirty when the run passed and was then edited again:
 * its line stays ` M src/a.ts` through any number of further edits, so the hook
 * reported "fresh" for code the run never exercised. Reproduced before fixing.
 */
export function currentStatus(): string[] | null {
  const out = git(["status", "--porcelain", "--", ...WATCHED_DIRECTORIES]);
  if (out === null) return null;

  const lines = out.split("\n").filter(Boolean);
  const paths = lines.map((line) => {
    const rest = line.slice(3).trim();
    const arrow = rest.indexOf(" -> ");
    return arrow === -1 ? rest : rest.slice(arrow + 4);
  });

  const hashes = hashObjects(paths);
  if (hashes === null) return null;

  return lines
    .map((line, index) => `${line.slice(0, 2)}\t${hashes[index]}\t${paths[index]}`)
    .sort();
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
