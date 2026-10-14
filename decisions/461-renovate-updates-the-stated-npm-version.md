# 461 — Renovate updates the npm version the documents state: decisions

Chore #461 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `tests/unit/config/renovate-npm-docs.test.ts` at `e4b182f` by #531.

- **Why the manager has a test.** `package.json`'s `packageManager` pin is
  the source, and README.md and INSTALL.md repeat it in prose.
  `tests/unit/scripts/setup-plan.test.ts` fails when they disagree with it,
  so twice the documents fell behind the pin and needed a hand-written
  commit: in chore #400 (12.0.1 against 12.0.2), and in Renovate's pull
  request #456 (12.0.2 against 12.1.0), which arrived red. The
  fix is a `customManagers` entry in `renovate.json`, which bumps those
  lines in the same pull request. Its real proof is Renovate's next npm
  update, which cannot be run from a test; the test proves the half that
  broke both times.
