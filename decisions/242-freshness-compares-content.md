# 242 — The freshness check compares content, not where git keeps it: decisions

Bug #242 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/e2e-freshness-plan.ts` at `5b180e0` by #531.

- **`Marker` holds content.** An earlier version stored `HEAD` plus the
  working-tree status, which describes where content lives, so committing
  moved a file from one half of that pair to the other and read as a change
  although nothing had been edited. Hashes have no such cases: identical
  content is identical, wherever git is keeping it.

Cut from `scripts/e2e-freshness.ts` at `5b180e0` by #531.

- **`changesSince`.** There is no second source and no commit history
  involved, which is why committing, staging, amending, rebasing and
  switching branches are all invisible: none of them change a byte. A
  `touch` with no content change likewise counts as nothing, which is the
  right answer and was not the old one.

Cut from `scripts/e2e-freshness-git.ts` at `5b180e0` by #531.

- **`describePath`.** `existsSync` follows symlinks, so a tracked symlink
  whose target is missing reports as absent and drops out of the
  fingerprint; editing or deleting it would then be invisible. `lstat`
  describes the link itself, which is the thing git tracks.
- **`hashAll`.** `--stdin-paths` is newline-delimited and so cannot express
  a filename containing one. Batching only keeps clear of the platform
  argument limit.

Cut from `scripts/e2e-freshness-reporter.ts` at `5b180e0` by #531.

- **What the reporter writes.** The hook compares hashes, so committing what
  the run already covered is invisible, while a deletion still shows as an
  entry that disappeared. A marker that cannot be checked is worse than
  none, because the hook would have to trust it.
