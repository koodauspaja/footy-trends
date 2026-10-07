# 403 — The coverage exclusion list holds only the files that earn it: decisions

Chore #403 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/e2e-freshness-git.ts` at `5b180e0` by #531.

- **`GitDeps`.** Injected the way `docker.ts` injects its spawn and
  `executable.ts` its existence check. `-z` on `ls-files`, and paths as
  arguments, are the difference between a fingerprint that covers a filename
  containing a newline and one that silently drops it; a test can assert
  that, where reading the file could not.

Cut from `scripts/e2e-freshness-reporter.ts` at `5b180e0` by #531.

- **`ReporterDeps`.** Playwright constructs a reporter with its configured
  options, and this one is configured with none, so the defaults are what
  production uses and the parameter exists for the test. Writing the real
  marker from a test would either vouch for a run that never happened or
  destroy the record of one that did.

Cut from `scripts/with-test-db.ts` at `5b180e0` by #531.

- **`with-test-db.ts` stays excluded.** Its decisions live in
  `with-test-db-plan.ts` and are tested there; what is left is the
  environment, the database and the spawn. `main()` runs at import and
  creates and migrates a database, so a test that imported the file would do
  that to whatever `DATABASE_URL` the importer had.

Cut from `scripts/with-test-db-plan.ts` at `5b180e0` by #531.

- **`with-test-db-plan.ts`.** Split out so the decisions are tested. The
  runner creates and migrates a database, a reason to keep it out of a unit
  suite, but the argument handling never needed one.
- **`parseInvocation`.** The wrapper exists to run something against the
  test database, and "nothing" is not something.
- **`executableFor`.** npm exposes package binaries as `.cmd` shims on
  Windows, which `spawn` cannot execute without a shell, the trap
  `scripts/executable.ts` documents; handing the runtime an `.mjs` entry
  sidesteps shims and `PATH` lookup together.

Cut from `tests/unit/app/global-error.test.tsx` at `c12c30a` by #531.

- **`global-error.tsx` has a test.** Nothing asserted that it rendered at
  all until this change.
