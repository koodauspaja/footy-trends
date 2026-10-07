# 399 — Every local command that needs the database starts it: decisions

Chore #399 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/services-plan.ts` at `5b180e0` by #531.

- **`services-plan.ts`.** The split `grant-admin-plan.ts` established: the
  rule can be tested directly because it touches nothing.
- **`decidePreflight`'s probes are thunks.** Postgres answering is the
  overwhelmingly common case, and in it nothing should spawn a process. It
  was booleans first, and the caller evaluated all of them eagerly, so
  `docker info` ran before every `npm run dev` and the preflight cost about
  1.6s instead of about 0.3s; a comment described an ordering the code did
  not have. Thunks make the ordering a property of the signature, and let a
  test assert that Docker was never asked. Accepting whatever answers means
  a Postgres run some other way (Homebrew services, a remote database, a
  devcontainer) is simply used: this exists to remove a confusing failure,
  not to insist on one way of running Postgres.
- **The URL is checked before probing.** The question "is the database up"
  is not meaningful until the string is one a database client could accept.
  Raised in review on #402.
- **A remote target.** `docker compose up -d` would bind this machine's 5432
  with a database that is not the one being connected to, and the probe
  would go on failing against the remote until the timeout: the command
  still fails, sixty seconds later, having also started two containers
  nobody asked for. The first version checked only whether Postgres
  answered, the right question for a local URL and the wrong one for any
  other. Caught in review on #402.
- **`noDockerMessage`.** This repository's own machines also have Podman,
  and OrbStack and Colima are common. "Install Docker Desktop" is wrong on
  those, and a check that looked for the app bundle would be wrong before
  the message ever printed.
- **`daemonNotStartedMessage`.** Saying "did not come up within 90s" when
  nothing was ever launched would be false, and would have come after 90s
  of waiting for it. Caught in review on #402.
- **`effectiveDatabaseUrl`.** The suites run against a database derived from
  `DATABASE_URL` by suffixing the name, on the same server, so probing
  `DATABASE_URL` is the same question. But `TEST_DATABASE_URL` overrides the
  derivation outright and may name a different server; probing the wrong one
  would start local containers for a run that never touches them.
  `TEST_DATABASE_URL` means nothing to `npm run dev`. Caught in review on
  #402.
- **`describeTarget`.** The string goes into a terminal, CI logs, a pasted
  bug report. Nothing needs the credential to locate the problem.
- **`parseTarget` returns `null`.** An unparseable `DATABASE_URL` is a real
  state a developer can be in, and the preflight's job is to say something
  useful about it, not to add a stack trace on top. `h:abc`, `h:70000` and
  `h:99999999` all raise `ERR_INVALID_URL`, measured; a `Number.isInteger`
  check on the port read as prudence and was dead code, which lcov found as
  a condition never taken.
- **`canStartDaemonAutomatically`.** macOS launches Docker Desktop with
  `open -a`, which needs nothing. Linux starts Docker through the service
  manager, which wants root, and a script that silently asked for a password
  would be a worse surprise than the message it would have saved. It is in
  the plan and not in `docker.ts` because it is a rule, not a process spawn:
  beside the spawn it would have been behind a coverage exclusion.
- **`LOCAL_HOSTS`.** `localhost` and the loopback literals are the only
  things a local compose setup produces, and anything cleverer, treating a
  private range as local, would start calling a colleague's machine on the
  office network local.
- **`COMPOSE_POSTGRES_PORT`.** The constant is a second copy, so it gets a
  mechanism and not a comment asking people to remember.
- **`probeUrls` tries two.** The configured database only: a managed
  Postgres whose user cannot reach the administrative `postgres` database
  reads as unreachable although the application's own database is fine, and
  the preflight blocks a command that would have worked. `postgres` only:
  the suite's database may not exist yet, since `ensureTestDatabase` creates
  it, so a `TEST_DATABASE_URL` naming it would read as unreachable until
  something else had run. The configured one is tried first because it is
  the one that has to work. Raised in review on #402.
- **`runsOnComposeServer`.** The host alone is not enough: a second local
  Postgres on another port passes a hostname check, and then the preflight
  starts compose containers that bind 5432 and cannot help whatever is
  listening on 6543, and `db:reset` destroys this project's volume while the
  URL it was pointed at is somewhere else, reporting a fresh database it
  never touched. Both questions are this one question, so there is one
  function. `http://localhost:5432/app` matched host and port and would have
  been accepted as the compose database. Raised in review on #402.
- **`resetRefusal`.** The same class of mistake `scripts/grant-admin.ts`
  designs out by refusing to read `.env`, except the cost is deleted data
  and not an unexpected grant, so this refuses and does not merely insist
  the value be explicit.
- **`waitFor`.** It was in `services-run.ts` at first and so behind a
  coverage exclusion, but a deadline loop is control flow, not IO, and an
  untested timeout is where an off-by-one lives. A service that is already
  up costs no delay. Sleeping a further full interval after a slow probe
  made the reported wait longer than the timeout asked for, so the message
  said "did not come up within 90s" after rather more. Both from review on
  #402.

Cut from `scripts/db-reset.ts` at `5b180e0` by #531.

- **`db-reset.ts` is wiring.** Both sequences, and every refusal in them,
  live in `db-reset-steps.ts` where they are unit tested. It stays uncovered
  because `void main()` at import means a test that imported it would reset
  the importer's database. npm exposes tsx as a shell script here and a
  `.cmd` shim on Windows, the trap `scripts/executable.ts` and
  `with-test-db.ts` document.

Cut from `scripts/db-reset-steps.ts` at `5b180e0` by #531.

- **`db-reset-steps.ts`.** The one command in the repository that deletes
  data on purpose, so the thing most worth a test is not the happy path: it
  is that each refusal happens before anything is destroyed. A refusal has
  to be the first thing that happens, not something reached after a probe
  that might itself fail and change the path, so that there is no sequence
  of events in which this deletes a volume it was not pointed at.

Cut from `scripts/docker.ts` at `5b180e0` by #531.

- **`docker.ts` is its own module.** The pre-push hook needs
  `dockerIsRunning` and nothing more; beside the Postgres probe in
  `services-run.ts` it would pull the database driver into every `git push`.
  The spawn is injected the way `executable.ts` injects its existence check,
  so every branch is testable and the file is not behind a coverage
  exclusion; review on #402 asked for that. Which arguments these pass is
  worth pinning down: `--volumes` is the difference between restarting the
  containers and destroying the data in them, and nothing else in the
  repository would notice if it disappeared.
- **`dockerIsRunning`.** "Not running" is the state the caller acts on
  either way. It lived in `e2e-freshness.ts`, and moved when a second caller
  needed the same question answered the same way.
- **`startDockerDaemon`.** Which platforms can be started is
  `canStartDaemonAutomatically`'s to say. `open` returns as soon as the
  application is launching, and the daemon is ready some time later.

Cut from `scripts/ensure-services.ts` at `5b180e0` by #531.

- **`ensure-services.ts`.** A `pre` script on every local entry point that
  needs the database: `dev`, the `db:*` commands and both test suites. npm
  runs `pre<name>` before `<name>` for any script, colon-named ones
  included, so nothing has to wrap or re-spawn the command it guards.
  `tests/e2e/global-setup.ts` already failed fast with the line that fixes
  it for a missing FOOTBALL_DATA_API_KEY and a missing TASO_API_KEY;
  Postgres was the third prerequisite and got nothing. With the containers
  down the run died inside the driver with a bare `AggregateError` at
  `tests/support/test-database.ts:94`, which names neither the cause nor the
  fix. The decision lives in `services-plan.ts` and the sequence in
  `preflight.ts`, both unit tested; this stays uncovered because
  `void main()` at import means a test that imported it would run it.
- **An unset `DATABASE_URL`.** `testDatabaseUrl()` names both variables and
  says to start the containers, and a second opinion would only get in front
  of a better one.

Cut from `scripts/preflight.ts` at `5b180e0` by #531.

- **`preflight.ts`.** Separate from `ensure-services.ts` so a test drives
  the whole sequence without a container, a daemon or a clock. The entry
  point is left holding nothing but the wiring.
- **A daemon that was not started.** `startDaemon` reports false on Linux
  and anywhere else the daemon needs root, and on macOS when the launch
  itself failed. Entering the wait loop there spent the full 90s polling for
  a process nobody had started, and then printed a message about it not
  coming up in time. Caught in review on #402.
- **One path to the containers.** Falling through, and not deciding again,
  is what makes "start Docker, then start the containers" one path instead
  of two that can disagree.

Cut from `scripts/services-run.ts` at `5b180e0` by #531.

- **`services-run.ts`.** `services-plan.ts` decides what the answers mean
  and `docker.ts` does the container side. It is in
  `sonar.coverage.exclusions` for the reason the other runners are.
- **`postgresAcceptsQueries`.** A TCP connect would be cheaper and is what
  the first draft did, but it says yes the moment the container binds, which
  is before the server accepts clients on a first run. `select 1` is the
  difference between "the port is open" and "you can migrate now". The
  `postgres` database always exists, so a refusal there means the server is
  not up and not that the database has not been created yet: two states with
  very different fixes.

Cut from `tests/support/test-database.ts` at `79f2c6a` by #531.

- **A blank `TEST_DATABASE_URL`.** The rule `grant-admin.ts` applies to its
  own connection string. Without the trim the preflight fell back to
  `DATABASE_URL` and reported the database ready, while this passed "   " to
  `new URL()`, which throws before a single test runs. Review on #402 caught
  the override and the base separately: one class, two halves.
