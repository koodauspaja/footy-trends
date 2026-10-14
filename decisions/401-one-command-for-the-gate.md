# 401 — One command for the gate, and a way to debug one e2e spec: decisions

Chore #401 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/verify-plan.ts` at `5b180e0` by #531.

- **`verify-plan.ts`.** The split `services-plan.ts` established, so the
  rules are tested directly.
- **The order of `VERIFY_STAGES`.** Measured: lint and typecheck are
  seconds, the unit suite about 40s with coverage, the shuffled run about
  30s, integration about 4s against a database that is already up, and the
  end-to-end suite about four minutes because it is serial by design and
  talks to the real providers. Running the four-minute stage first would
  waste the whole point of stopping at the first failure.
- **`NOT_A_STAGE` gives reasons.** "Not in the list" and "nobody noticed"
  look identical otherwise.
- **`RUNS_SCRIPT`.** An npm script may be named `lint.fix` or
  `deploy@staging`, and a pattern of `[\w:-]+` read such a step as running
  no script at all, so CI could gain a stage and the audit would stay quiet,
  the one thing it exists not to do. Raised in review on #410.
- **`workflowScripts` slices the match.** A capture group is typed as
  possibly absent, and the fallback for it would be a condition no test can
  take, which `scripts/coverage-gaps.ts` reports, rightly.
- **`isWorkflowFile`.** A `.yaml` workflow would otherwise be invisible to
  the audit, and invisible is exactly what a new uncovered stage must not
  be. Raised in review on #410.
- **`stagesMissingFrom`.** The answer to the issue's own warning: deriving
  the stages from the workflows at runtime would make a broken workflow a
  broken local command, so the duplication is kept small and a test fails
  the moment the two disagree. The comparator answers Sonar's S2871: a bare
  sort is a different answer from the alphabetical one it looks like.
- **`failureMessage`.** The output above it may be thousands of lines of a
  test runner.

Cut from `scripts/verify-steps.ts` at `5b180e0` by #531.

- **`verify-steps.ts`.** Separate from `verify.ts` so a test drives the
  whole sequence without running a suite: the shape `setup-steps.ts` has.
- **`runVerify` returns the stage's code.** `npm run verify` is what CI and
  a pre-push hook would read.

Cut from `scripts/entry-point.ts` at `5b180e0` by #531.

- **`entry-point.ts`.** Every other runner in `scripts/` calls `main()` at
  import and so sits in `sonar.coverage.exclusions`, because a test that
  imported one would run it. It was introduced for `setup-main.ts`, and
  `verify.ts` needed the same, which is why it has a file of its own and is
  not beside the setup wiring it was born in.
- **`isEntryPoint`.** Measured: `tsx scripts/verify.ts` and `npm run verify`
  both give the script's absolute path in `process.argv[1]`, and under
  vitest it is the test runner's own worker. A bare `endsWith` let an
  unrelated file start setup; raised in review on #409.
- **`runWhenMain` sets the exit code.** Nothing above a top-level call could
  do anything with a returned one.

Cut from `scripts/verify.ts` at `5b180e0` by #531.

- **`verify.ts`.** The gate is lint, typecheck, the unit suite, the shuffled
  unit suite, integration and end-to-end. The stages are in `verify-plan.ts`
  and the sequence in `verify-steps.ts`, both unit tested; `runWhenMain`
  starts the gate only when Node was pointed at this file.
