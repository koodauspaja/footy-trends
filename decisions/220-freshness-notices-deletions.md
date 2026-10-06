# 220 — The freshness check notices deleted files: decisions

Bug #220 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/e2e-freshness-plan.ts` at `5b180e0` by #531.

- **`parseMarker`.** A corrupt or outdated marker fails closed and does not
  vouch for a run it cannot describe.
- **`describeChange`.** A deletion and an edit need different responses, and
  "3 file(s) changed" hid that.
- **`changedBetweenFingerprints`.** Three cases and no more, which is the
  point of comparing content: where git was keeping the bytes (working tree,
  index, a commit) never enters into it.

Cut from `scripts/e2e-freshness-git.ts` at `5b180e0` by #531.

- **`e2e-freshness-git.ts`.** Kept apart from `e2e-freshness-plan.ts` so
  the decisions there stay pure and unit-testable, and apart from the hook
  so the reporter can reuse it without pulling in the hook's `docker` probe.
  An empty list and a failed command look identical unless `null` says
  otherwise, and "git failed" would read as "nothing is there": the check
  would pass having verified nothing.
- **`symlinkEntry`.** Letting `git hash-object` fail on a dangling link
  would take the whole fingerprint with it, and one broken symlink under
  `src/` would then block every push and stop a passing run recording
  anything. Retargeting the link still shows as a change.
- **`watchedPaths`.** Without `-z` git quotes any path needing escaping: a
  newline in a filename comes back as the literal `"src/od\nd.ts"`, which
  matches no file and would silently drop it. A tracked file deleted from
  the working tree is simply absent, which is what makes a deletion visible.
- **`fingerprint`.** `HEAD` plus working-tree status also forced special
  cases for a rebase or a branch switch; a content fingerprint has none.
  Cheap: 94 files in about 37ms.
