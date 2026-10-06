# 471 — Dependency updates are filed as chores, not bugs: decisions

Chore #471 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/next-version.ts` at `5b180e0` by #531.

- **`DEPENDENCY_SCOPE`.** Renovate writes `fix(deps):` when the upstream
  release called itself a fix, and `chore(deps):` otherwise: a distinction
  about someone else's library, taken from someone else's changelog.
- **`isDependencyUpdate`.** `fix(deps): update dependency next to v16.3.6`
  is maintenance: nothing in this repository was broken, and a reader of the
  release notes looking under `Bugs` for what went wrong finds three library
  bumps. A feature moves the minor, and a library's own release being a
  feature says nothing about whether this application gained one; the first
  version excluded `deps` from the fixes and not from the features, raised
  in review on #471. `!` and a `BREAKING CHANGE:` footer are deliberate
  statements by whoever wrote them, not a type copied from an upstream
  changelog, and an upgrade that breaks this application is what they are
  for.
