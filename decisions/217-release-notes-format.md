# 217 — Release notes in the agreed format: decisions

Chore #217 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/next-version.ts` at `5b180e0` by #531.

- **`ReleaseEntry`.** `chore: repair the allowlist (#210) (#212)` carries
  the reference and the description. A formatter that needed the network
  would fail exactly when it is used.
- **`describeCommit`.** A squash merge appends its own `(#N)`, so a subject
  that already named an issue ends with two references. The issue is what a
  reader wants, since it says why the work happened and not how it landed.
  A single reference means no issue was named, which is what Renovate's
  commits look like; it is used so the row keeps an identity.
- **`escapeTableCell`.** Escaping is cheaper than forbidding the character
  in commit messages.
