# End-to-end tests

Playwright tests that exercise the running application through a real
Chromium browser, against a real Postgres/Redis and the live
football-data.org API — the same setup used for local development
(`npm run dev`), not a mocked provider.

## The suite has its own database, and its own port

Since #304, `npm run test:e2e` runs against **`<your database>_test`**, on
**port 3001**, with its own server. Nothing here reads or writes the database
`npm run dev` uses.

That is not tidiness. Six specs used to pass only on machines whose database had
been synced *before* #272, because a completed season is never refetched and so
never corrects itself — they asserted a shape that only a stale database has, and
failed for everyone else, CI included. Ambient data cannot decide a test result
if the test does not share the database.

| | |
|---|---|
| Database | `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` appended to the name |
| Created and migrated | automatically, by `tests/e2e/global-setup.ts` |
| Port | 3001, so `npm run dev` can keep running on 3000 |
| Server reuse | never — a server already listening was started against the *development* database |

`tests/integration` uses the same database, through
`scripts/with-test-db.ts`. It creates and deletes rows, and used to do that in
whatever database the developer was signed into.

### One season is seeded, not fetched

`tests/e2e/fixtures/veikkausliiga-2017.ts` is written into the test database
before the suite runs. It exists because the rendering rules those specs check —
a knockout group showing its matches instead of a table, and the bracket built
from them — depend on a shape TASO no longer produces through the endpoint the
app reads. Seeding also costs nothing: a completed season with stored rows is
never refetched, so those pages make no provider request at all.

## Prerequisites

- `docker compose up -d` (Postgres + Redis running locally)
- A configured `.env` with a working `FOOTBALL_DATA_API_KEY` **and**
  `TASO_API_KEY` (see `README.md`'s Quick Start and
  `docs/setup/020-taso-api-key.md`). `global-setup.ts` fails fast on either
  being missing, rather than letting every spec time out against a generic
  error page
- Chromium installed for Playwright: `npm run test:e2e:browser`
  (one-time, not run automatically on `npm install`). The same script the
  release workflow runs, so a local browser matches CI's. Not `npx`, which may
  fetch a package on demand and run its lifecycle scripts; this resolves the
  playwright already in `node_modules`. Its `--with-deps` installs the shared
  libraries a headless browser needs on Linux and is a no-op on macOS

## Running

```bash
npm run test:e2e
```

`playwright.config.ts` starts the server itself, on port 3001, pointed at the
test database. It never reuses one that is already listening: that server
belongs to somebody else and is on the development database, which is the whole
thing this separation removes. `npm run dev` on port 3000 is unaffected and can
keep running.

### The suite runs serially, everywhere

`workers: 1` is set unconditionally, not only in CI (#227). Parallel workers
exhaust football-data.org's per-key rate limit and fail as regressions that are
not real.

This was CI-only until it was measured failing three times in a single day, on
changes that could not have caused it:

| Change under test | Parallel | Serial, same commit |
|---|---|---|
| A dependency bump | 118/119 | **119 passed** |
| Release-notes formatting | 118/119 | **119 passed** |
| **One Markdown file** | **114**/119 | **119 passed** |

The third lost five specs across four files, with `The destination stream closed
early` in the server log, on a docs-only change. The correct response every time
was "ignore it and re-run serially" — which is precisely the reflex that lets a
real regression through.

**The cost is about 30 seconds.** Measured on 119 specs: parallel ~50s, serial
**~1m20s**, and two consecutive serial runs both passed. That buys a suite whose
failures mean something.

It matters to the pre-push hook too. The hook writes its freshness marker only
when a full run passes, so a spurious parallel failure left no marker, the next
push was blocked, and the fix was to re-run — serially, if you knew to. If you
did not, the hook simply looked broken.

To run them the way the release gate does, against a production build:

```bash
# Stop `npm run dev` first — see below.
npm run build
E2E_TARGET=build npm run test:e2e
```

`E2E_TARGET=build` deliberately refuses to reuse a server already on port 3000,
even locally. Reusing one would mean a `next dev` already running is silently
accepted and the run reports on the dev server while claiming to test what
ships. It fails with "already used" instead, which is the loud version of the
same situation.

Worth doing before cutting a release, and worth reaching for when a spec
passes locally but fails in CI: `dev` and a production build do not always
behave the same, which is how #189 was found.

## The pre-push hook

`npm run test:e2e` is easy to forget, and this suite is the only thing that
exercises the app end to end before a release. A git `pre-push` hook nudges,
and blocks, when nothing vouches for what you are pushing (#84).

It is installed by `npm install` — Husky's `prepare` script wires
`core.hooksPath` to `.husky/`, so a fresh clone gets it with no manual step.

### What it checks

A full, passing run writes `.e2e-freshness` (gitignored). The hook blocks when:

| Condition | Message |
|---|---|
| No marker | `No passing full e2e run has been recorded` |
| Older than **12 hours** | `The last passing e2e run finished 13 h 0 min ago` |
| Files under `src/` or `tests/e2e/` modified since the marker | `3 file(s) changed since the last passing e2e run: …` |

The file comparison is the load-bearing one — a run is stale the moment the
code it exercised changes. The twelve-hour window is a backstop for what that
cannot see: a dependency bump, a `.env` edit, a provider changing its data.

Modification times are read from the working tree rather than from the commits
being pushed, because what matters is whether the code on disk is the code the
suite ran against. An uncommitted edit breaks that just as thoroughly as a
commit does.

### It warns instead of blocking without local infrastructure

If Docker is not running, or `FOOTBALL_DATA_API_KEY` or `TASO_API_KEY` is
unset, the same finding prints as a warning and the push proceeds. A
contributor who cannot run the suite is not choosing to skip it, and a gate
everyone routinely bypasses stops being a gate.

### The escape hatch

```bash
git push --no-verify
```

Skips the hook entirely. Reach for it when you know the suite is irrelevant to
what you are pushing — a docs-only change, say.

### Only a full run counts

The marker is written by a Playwright reporter (`scripts/e2e-freshness-reporter.ts`)
wired into `playwright.config.ts`, and only when the run both **passed** and
covered **every spec file**. `--grep`, `--shard`, and naming a spec on the
command line all leave the marker untouched, because a marker from a filtered
run would claim a freshness it did not earn — and the hook would then wave
through a push whose changes were never exercised.

It is a reporter rather than an `&&` on the `test:e2e` script because npm
appends a script's extra arguments to the end of the whole command, so
`npm run test:e2e -- --grep x` would have handed `--grep x` to the marker
writer instead of to Playwright.

The decision logic lives in `scripts/e2e-freshness-plan.ts`, kept free of the
filesystem and `docker` so it is unit-tested directly.

## What's covered

One or two focused tests per shipped flow, asserting on structure and
behavior (headings, table presence, row counts, URL params, Finnish
fallback banners) rather than specific team names or scores — the real
season's data changes over time, so hardcoding exact content would make
these tests brittle:

- `picker.spec.ts` — the competition picker at `/` lists competitions and
  navigates to the chosen one's standings page.
- `standings.spec.ts` — `/sarjataulukko` loads the standings table for the
  default season and for a different competition (`kilpailu`); the
  `Kierros` selector narrows standings and updates the URL; invalid
  `kausi`/`kierros` show their Finnish fallback banners.
- `team.spec.ts` — clicking a team name navigates to `/joukkue/:id` and
  shows its match list; an unknown team id shows the not-found state.
- `matches.spec.ts` — `/ottelut` shows the current round and round
  navigation works for both the default and a different competition; a
  team name links back to `/joukkue/:id`; an invalid `kierros` shows its
  fallback banner.

## Not covered here

- Running on every pull request. This suite runs in
  `.github/workflows/release.yml` only — on pull requests targeting `release`
  and on pushes to it. `.github/workflows/ci.yml` stays typecheck/lint/unit/
  integration and is scoped to `main`.
- Cross-browser coverage — Chromium only.
- Enforcing the pre-push hook. It is a local nudge, not a gate: `--no-verify`
  skips it, and it cannot run in CI at all. The release workflow is what
  actually gates a release on this suite.
