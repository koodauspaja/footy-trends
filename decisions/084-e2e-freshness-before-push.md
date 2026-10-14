# 084 — A push needs a passing e2e run that covers it: decisions

Chore #084 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/e2e-freshness-plan.ts` at `5b180e0` by #531.

- **`e2e-freshness-plan.ts`.** The same split as `backfill-plan.ts` and its
  entry point.
- **`MAX_AGE_MS`.** The load-bearing check is the file comparison: a run is
  stale the moment the code it exercised changes. The window covers a
  dependency bump, a `.env` edit, a provider changing its data underneath
  us. Twelve hours means a morning's run does not nag all morning, but
  yesterday's does not vouch for today.
- **`isFullRun`.** A marker written by a filtered run would claim a
  freshness it did not earn, which is worse than no marker: the hook would
  wave through a push whose changes were never exercised. `--grep` narrows
  without dropping a file, and naming a spec on the command line drops files
  without touching `grep`.
- **`Assessment`.** A discriminated result and not `string | null`, so the
  caller reaching the passing branch has the marker in hand; the alternative
  needed a `marker === null` guard there that nothing could satisfy.
- **`decideFreshness` warns where the suite cannot run.** A contributor
  without Docker or the provider keys is not choosing to skip e2e. Blocking
  them would only teach them to pass `--no-verify` always, and a gate
  everyone routinely bypasses stops being a gate.
- **A marker from the future.** Clock skew or a hand-edit would otherwise
  sail past the staleness check, since a negative age is never greater than
  the window.

Cut from `scripts/e2e-freshness-reporter.ts` at `5b180e0` by #531.

- **The reporter is wired into `playwright.config.ts`.** Chained onto the
  `test:e2e` script with `&&`, npm would append a script's extra arguments
  to the end of the whole command: `npm run test:e2e -- --grep x` would have
  handed `--grep x` to the marker writer and not to Playwright.

Cut from `playwright.config.ts` at `5b180e0` by #531.

- **The reporter in `playwright.config.ts`.** A reporter and not an `&&` on
  the `test:e2e` script, because npm appends a script's extra arguments to
  the end of the whole command, which would have misrouted them.
