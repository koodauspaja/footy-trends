/**
 * The pre-push rule that a branch is pushed only when it is up to date with
 * `origin/main`. Pure: `up-to-date-steps.ts` fetches and asks git.
 *
 * decisions/806-push-and-pr-hooks.md
 */

/**
 * The branches whose pushes are not checked: `main` is what the others are
 * checked against, and `release` is promoted from it.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export const UNCHECKED_BRANCHES = ["main", "release"];

export type BranchPush = { branch: string; sha: string };

/**
 * The branches a push sends, read from the `<local ref> <local sha> <remote
 * ref> <remote sha>` lines git gives a pre-push hook. A tag, a deletion and an
 * unchecked branch are left out. `null` when a line is not in that shape.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function branchPushes(stdin: string): BranchPush[] | null {
  const pushes: BranchPush[] = [];
  for (const line of stdin.split("\n")) {
    if (line.trim() === "") continue;
    const match = /^\S+ ([0-9a-f]{40,64}) (\S+) [0-9a-f]{40,64}$/.exec(line.trim());
    if (match === null) return null;
    const [, sha = "", remoteRef = ""] = match;
    const branch = remoteRef.startsWith("refs/heads/")
      ? remoteRef.slice("refs/heads/".length)
      : null;
    if (branch === null || /^0+$/.test(sha) || UNCHECKED_BRANCHES.includes(branch)) continue;
    pushes.push({ branch, sha });
  }
  return pushes;
}

/**
 * What the check prints when the fetch fails and it cannot tell.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export const FETCH_FAILED =
  "Up-to-date check skipped: git could not fetch origin/main, so it cannot tell whether this branch is behind.";

/**
 * What a push of a branch behind `origin/main` is refused with.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function behindRefusal(behind: readonly string[]): string {
  return [
    `Push blocked: ${behind.join(", ")} ${behind.length === 1 ? "is" : "are"} behind origin/main.`,
    "A pull request on a stale base is reviewed against code main no longer has. Rebase first:",
    "",
    "  git fetch origin && git rebase origin/main",
    "",
    "To push anyway, use 'git push --no-verify'.",
  ].join("\n");
}
