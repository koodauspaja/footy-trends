# 568 — The end-to-end suite runs against a production build: decisions

## Decision

`npm run test:e2e` builds the application and runs the suite against that
build. It is what `npm run verify` runs as its last stage and what the pre-push
hook asks for, so both now test what ships.

| `E2E_TARGET` | The server | Writes the pre-push marker |
|---|---|---|
| unset | `npm run build`, then `npm start` | yes |
| `build` | `npm start`, on a build the caller made | no |
| `dev` | `npm run dev` | no |

The production build only, not both targets.

## Why

`next dev` and a production build do not behave the same: the build prefetches
links and `next dev` does not. A defect of that kind passed every check a pull
request ran and was found at the release gate, twice
(`decisions/189-same-route-links.md`).

Measured on this machine at `1686edc`, 2026-10-09, one run of each, 358 tests:

| Target | Wall time |
|---|---|
| `next dev` | 4 min 39 s |
| Production build | 3 min 54 s: 32 s of build, 3 min 22 s of suite |
| Both | 8 min 33 s |

The dev run went first, so the second started with the provider responses the
first had cached; the one run of 2026-10-05 on the issue gave 4.3 min and about
4.6 min. Either way the build does not cost more than the dev server did, and
running both would double the stage to find nothing the build alone misses: no
defect is known that `next dev` shows and a build hides.

## How

- **The build is part of the server command, not a stage of `verify`.** A
  separate stage would leave `npm run test:e2e`, the command the hook's message
  names, serving whatever build was last made. A stale build then passes and
  writes a marker for code it never ran.
- **`build` keeps its meaning.** `release.yml` builds in a step of its own and
  sets it, as `decisions/085-release-workflow.md` has it, and is unchanged.
  That record's reason for not building in `webServer` was the start-up
  timeout; the fresh build has its own, five minutes.
- **Only a run that built its server writes the marker.** Against `build` or
  `dev` nothing says the server is the code on disk as it ships, so the
  reporter stays silent, as it does for a narrowed run.
- **The marker is written only when the watched files end as they started.**
  A dev server recompiled a file edited mid-run; a build does not, so the run
  tested the files as they were before it. The reporter reads them when
  Playwright constructs it, which is before the server starts, and again at the
  end.
- **The files that decide the server are watched.** `next.config.ts`,
  `playwright.config.ts` and `scripts/e2e-target.ts` join `src` and
  `tests/e2e`, so a change to which server runs, or to its route table, makes
  an earlier marker stale.
- **An unknown `E2E_TARGET` is the fresh build.** A typo must not land on the
  dev server, where this class of defect cannot fail.
- **A running `npm run dev` does not get in the way.** It is on port 3000 and
  writes to `.next/dev`; the build writes to `.next`. A server already on port
  3001 stops the run at once, with Playwright's own message that the address is
  already used.

## What this does not do

- **It does not watch `package.json`, the lockfile or
  `tests/support/test-database.ts`.** Review asked for them. A dependency bump
  is what the twelve-hour window is for
  (`decisions/084-e2e-freshness-before-push.md`), and that line is not moved
  here: watching the lockfile would make every merged dependency update ask
  for a new run before the next push.
- **It does not notice a file edited and put back while the suite ran.** The
  start and the end then match, though the build may hold the edit. Seeing that
  takes a file watcher for the length of the run, which is more machinery than
  a local nudge that `--no-verify` skips has earned.

## What this overrides

- `decisions/401-one-command-for-the-gate.md` exempted `build` from the stages
  because `verify` was not the release gate. It is still not a stage; the reason
  is now that `test:e2e` builds.
- `decisions/189-same-route-links.md`, "Nothing stops the next plain `<Link>`
  to the same route": the suite a pull request's author runs now fails on one.

## Tests

- `tests/unit/scripts/e2e-target.test.ts`: the three targets, their commands
  and which one may vouch for a push.
- `tests/unit/scripts/e2e-freshness-reporter.test.ts`: a full passing run that
  did not build its server writes nothing, and neither does one during which
  a watched file was edited, added or deleted.
