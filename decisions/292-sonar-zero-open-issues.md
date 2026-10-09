# 292 — Sonar at zero open issues on main: decisions

Chore #292 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/e2e-freshness-plan.ts` at `5b180e0` by #531.

- **`inFixedOrder`.** The bare sort was the CRITICAL Sonar finding;
  `localeCompare`, the fix it suggests, would be worse than the bug, because
  it orders by locale and ICU version. The list is compared against one
  written by an earlier run, possibly on another machine in CI, so an
  ordering that depends on the machine would report a clean tree as stale
  and send someone re-running e2e for nothing.

Cut from `scripts/next-version.ts` at `5b180e0` by #531.

- **`parseSubject`.** The three call sites ran `CONVENTIONAL.exec`
  themselves and reached into `.groups` for one field each, which left the
  regex and its readers in different functions: invisible to a reader, and
  to Sonar, which reported the names as unused. Parsing in one place beside
  the pattern makes the groups obviously read.
- **`nextTripleFor`.** A named function and not a nested ternary: the three
  cases are the whole of semantic versioning's arithmetic, and reading them
  as one expression means holding two conditions at once to answer "what
  happens to patch?".
- **`decideBump`'s `reasons`.** The pre-1.0 rule reads as a correction to
  the line above it, which is why the list is appended to in order.
- **The first release cannot be derived.** `release` already holds the
  whole history, so the commits in the promotion range describe only what
  happened since the branch was cut: one docs commit would otherwise name
  the first production release v0.0.1. v0.1.0 is the floor; going straight
  to v1.0.0 is a statement about stability and stays a deliberate call.

Cut from `scripts/backfill-run.ts` at `5b180e0` by #531.

- **`backfillFootballData` and `backfillTasoSeason`.** The two providers
  share nothing but the counters: different rate limits, different season
  discovery, different failure shapes, and reading them as one function
  meant holding both at once. The TASO loop and its work are different jobs
  too: the loop knows about competitions and seasons, the season function
  about the two separate writes and what it means for one to be stored and
  the other not.
- **`competitionIdForSeason` in the backfill.** Most competitions sit under
  the season umbrella (`spljp26`). The generic id asks TASO about a
  competition that does not exist there, and TASO answers with an empty list
  and not an error, so the run reports success having stored nothing.
- **The backfill's current season.** `new Date().getUTCFullYear()`
  contradicted the discovery feature, and the two disagree whenever TASO
  publishes the next season before January or runs the current one past it.
  That value decides which seasons are fetched and, through `canSkip`, which
  count as finished, so a disagreement can skip a season that is still
  gaining matches; found as #219. `getCurrentSeason` and not
  `resolveTasoSeasonContext`, which the app uses: that also computes
  `defaultSeason`, and answering "does this season have matches" means
  syncing the season; thirteen of those turns a discovery step into a second
  backfill. Discovery itself is competition-agnostic.
- **Discovery's two failure shapes.** The app's own `discoverCurrentSeason`
  wraps the call in a try for this reason. Without the catch, a provider
  outage escapes to the top-level handler, and the run loses both the
  refusal and the summary line that reports how much of the football-data
  half succeeded.

Cut from `scripts/executable.ts` at `5b180e0` by #531.

- **`executable.ts`.** `spawnSync("git", …)` resolves the name through
  `PATH`, so which program runs depends on what happens to be earlier in it;
  Sonar flags it, and is right to. A `git` dropped into a writeable
  directory ahead of `/usr/bin` would be run by the pre-push hook with the
  repository already in hand. The tools are ordinary system installs in
  ordinary places, so naming those places costs nothing and removes the
  question; a machine that keeps one elsewhere (nix, asdf, a container) says
  where.
- **`WINDOWS_SUFFIXES`.** Accepting `.cmd` and `.bat` was the obvious
  generalisation, since a Windows git install really can put `git.cmd` on
  the path. But the callers do not pass `{ shell: true }` and should not:
  the point of the module is that the command is a path we chose, not a
  string a shell interprets. Accepting them would hand back a path that
  resolves and then fails to spawn, the failure the check exists to prevent.
- **`looksRunnable`.** Existence alone is not enough: a directory named
  `git`, or a file without the execute bit, would be returned as the binary
  and fail at `spawnSync` with a message about the spawn and not the path,
  with the remaining candidates never tried. It cannot promise the file
  will start: a `.exe` may be a text file with an `.exe` name, and a POSIX
  file with the execute bit may be a corrupt binary or a script with a bad
  shebang. Reading a PE or ELF header would only move the line, since a
  truncated binary passes that too. The value is in the failures it does
  catch, the ones that happen: a directory, a data file, an override
  pointing at the wrong thing.
- **`executablePath` returns `null`.** Every caller already has a meaning
  for "this tool could not answer": the freshness check warns, the docker
  probe reports not running. A missing tool is not different in kind from a
  tool that failed.
- **The existence check is injected.** `node:fs` is a builtin whose
  namespace does not reliably take a partial module mock, and a test that
  silently falls through to the real filesystem asserts whatever the machine
  happens to have installed.

Cut from `scripts/verify-sentry.ts` at `5b180e0` by #531.

- **`outcomeOf`.** Named and not nested ternaries: "no event id" and "an
  event id that never flushed" are different failures with different causes,
  one configuration and the other the network, and reading them as one
  expression hides that.

Cut from `scripts/e2e-freshness-git.ts` at `5b180e0` by #531.

- **A missing git in the freshness check.** The function's `null` already
  means "git could not tell us", and the caller warns and does not block the
  push.

Cut from `scripts/release-version.ts` at `5b180e0` by #531.

- **`release-version.ts` throws without git.** A release built by whatever
  `git` happened to be first in someone's path is not a release anyone
  should trust.

## Moved from comments, 2026-10-08

Cut from `tests/unit/scripts/executable.test.ts` at `a15a9f9` by #531.

- **`env: {}` in every call of `executable.test.ts`.** Found by setting
  `GIT_EXECUTABLE` and watching two tests that were not about overrides at
  all go red.
