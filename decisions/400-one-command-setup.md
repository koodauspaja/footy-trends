# 400 — One command from a fresh clone to a running app: decisions

Chore #400 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/services-plan.ts` at `5b180e0` by #531.

- **`COMPOSE_POSTGRES_USER`.** `npm run setup` builds `DATABASE_URL` from the
  three compose constants, so a disagreement would write a connection string
  for a user the container never had.

Cut from `scripts/setup-plan.ts` at `5b180e0` by #531.

- **The password is generated, not shipped.** Everything in `DATABASE_URL`
  except the password is already fixed by `docker-compose.yml`, and
  `.env.example` is tracked, which #292 deliberately took credentials out
  of. Writing one generated value into both `FOOTY_POSTGRES_PASSWORD` and
  `DATABASE_URL` at once also removes the mismatch `.env.example` used to
  warn about: the two halves cannot disagree when one hand writes both.
  `setup-plan.ts` follows the split `services-plan.ts` does, so every rule
  is tested directly.
- **`LEGACY_DATABASE_URL`.** A `.env` copied by hand from the old example,
  the old Quick Start, carries it still. Left in place it would be kept as
  though somebody had chosen it.
- **`composeDatabaseUrl` encodes the password.** Measured on Node 24. A
  generated password never contains `%`, but one adopted from an existing
  `.env` might.
- **`ComposeCredential` has three answers.** `elsewhere` and `unreadable`
  shared `null` and need opposite handling: a URL for another server is
  somebody's deliberate choice and none of setup's business, while one that
  names this database with an undecodable credential is a broken file.
  Treating the second as the first wrote a fresh password beside the broken
  URL and handed a migration a connection string that could not work.
  Using `runsOnComposeServer` there adopted a different database's password
  into `FOOTY_POSTGRES_PASSWORD`, which this project's container is then
  created with; `isComposeDatabase` is the narrower question. Both raised in
  review on #409.
- **`ENV_VALUE`.** Measured against Node's `parseEnv`: `#` starts a comment
  even with no space before it, so `KEY=a#b` reads back as `a`, and
  whitespace is trimmed from the ends. An adopted password is the one value
  that arrives from outside, already decoded.
- **`setEnvValue` replaces every assignment.** A later duplicate wins when
  the file is read, so replacing only the first would write a value nothing
  ever sees. Nothing reaches it unchecked, since keys are screened by
  `readKeyInput` and the rest are generated, so a throw is a bug in the
  module and not an input. `parseEnv` types its result with optional
  values, and an absent variable and an empty one mean the same thing.
- **The report never prints a value.** It is printed, and it is mostly
  credentials.
- **`planEnv` replaces nothing.** The password is the one a Postgres volume
  was initialised with, and regenerating it would lock the developer out of
  their own database with nothing pointing at why. A `.env` from before
  #292 holds the compose credential only in `DATABASE_URL`, so that one is
  adopted. `…:ab%23cd@…` is the password `ab#cd`, which `.env` cannot carry
  unquoted; writing it anyway threw, so setup died on an existing `.env` it
  was meant to repair. Raised in review on #409.
- **A URL for another server is not compared.** Homebrew Postgres, a
  devcontainer, a remote database: its password is not ours.
- **`unreadableUrlMessage`.** A malformed percent escape such as `%E0%A4%A`.
  Nothing in setup can repair the URL, and migrating would fail on a
  connection string the developer has not been told about.
- **`DATABASE_VARIABLES`.** Only these two: the rest of `.env` can be
  overridden in a shell without anything silently pointing elsewhere.
- **`exportedOverrideMessage`.** `process.loadEnvFile` does not overwrite a
  variable that is already set, and Compose gives a shell export precedence
  over `.env`, as `.env.example` says about the `FOOTY_` prefix. So
  `npm run db:migrate` would migrate the exported database while `.env`
  described another, and the dev server would then read the file's. Measured
  on Node 24: with `DATABASE_URL=` exported, `loadEnvFile` leaves it as `""`,
  and the child migrates with no connection string at all, from a `.env`
  that has a perfectly good one. Raised in review on #409, where this was
  written the wrong way round and had a test agreeing with it. ` pw ` and
  `pw` are different passwords.
- **`unwritablePasswordMessage`.** A substitute password would fail to
  connect while looking deliberate.
- **`API_KEYS` names the pages.** "Some pages will not work" sends a
  newcomer looking for a bug.
- **`npmVersionWarning`.** The install has already happened by the time it
  runs, and most differences are harmless; it is said because the lockfile
  is what a different npm quietly rewrites. Not `corepack enable`, which
  #400 suggested: corepack is no longer bundled from Node 25, so a setup
  built on it would stop working at the next Node upgrade. Naming the
  command is the part that survives.
- **`wantsDevServer`.** Nobody pressing Ctrl-D is asking for a dev server to
  be started in front of them.

Cut from `scripts/setup-main.ts` at `5b180e0` by #531.

- **`setup-main.ts`.** `scripts/setup` checks for Node and `docker compose`
  and installs the dependencies first. The decisions are in `setup-plan.ts`,
  the sequence in `setup-steps.ts` and the outside world in
  `setup-wiring.ts`; `runWhenMain` starts setup only when Node was pointed
  at this file, so the entry point is a tested, unexcluded source file.
  Named `setup-main.ts`, not `setup.ts`, because `scripts/setup`, the shell
  half, already holds that name: two files differing only by extension are
  ambiguous to anything resolving without one, and a test importing
  `scripts/setup` got the shell script and failed on its `#` comments.

Cut from `scripts/setup-steps.ts` at `5b180e0` by #531.

- **`setup-steps.ts`.** Separate from `setup.ts` so that a test drives the
  whole sequence without a terminal, a file or a container: the shape
  `preflight.ts` has. `npm run db:migrate` already starts what it needs
  through the preflight, and a second copy of that logic would be the one
  that drifts.
- **`secureEnv`.** A file that already had every value keeps its permissions
  otherwise, and `cp .env.example .env` makes a world-readable one. Raised
  in review on #409.
- **`writeEnvFile` reports first.** Nobody should answer two key prompts and
  only then be told that the `.env` they already had cannot be used.
- **`exportWins`.** The `.env` is correct and worth keeping, and the next
  run finds it complete once the export is gone.
- **`installBrowser`.** The browser is needed by `npm run test:e2e` alone,
  and a failed download, offline or behind a proxy, should not keep someone
  from the dev server they came for.

Cut from `scripts/setup-wiring.ts` at `5b180e0` by #531.

- **`setup-wiring.ts` and `setup-main.ts`.** A runner that calls `main()` at
  import cannot be imported by a test, since the test would run it, so the
  repository has a row of such files behind `sonar.coverage.exclusions`, and
  the issue asked not to add another. The work lives where it is injected
  and tested, and `setup-main.ts` is two lines that `entry-point.ts` decides
  whether to act on; importing it from a test does nothing.
- **`secret`.** As strong as `openssl rand -base64 32`, which `.env.example`
  suggests for the auth secret.
- **`makeAsk`.** `question` rejects with `AbortError: Aborted with Ctrl+D`,
  and an uncaught one ended setup with a stack trace where the prompt had
  just said "press Enter to skip". Found by running it in a fresh clone, the
  only place it appears. Every prompt is optional, so the honest reading of
  "no more input" is that nothing more was chosen.
- **`npmCliFrom`.** The reasoning `executable.ts` gives for git and docker.
  Being started some other way is a different problem from npm being
  missing.
- **`.env` is owner-only.** A `.env` that already existed kept whatever
  permissions it had while gaining secrets: `cp .env.example .env` makes an
  0644 file under a normal umask, readable by every account on the machine.
  Raised in review on #409.

Cut from `vitest.config.ts` at `5b180e0` by #531.

- **Sonar's exclusions in `vitest.config.ts`.** The two lists had never met,
  because a file listed in Sonar's was also a file no test imported, so
  vitest never saw it either. `setup-wiring.ts` imports `services-run.ts`,
  so a test of the wiring pulls an excluded runner into the report and the
  totals fall below the 100% this repository holds itself to, for a file
  Sonar deliberately ignores. `scripts/coverage-gaps.ts` still fails on any
  source file that is missing from the report without being excluded
  there.

## Moved from comments, 2026-10-08

Cut from `tests/unit/scripts/setup-plan.test.ts` at `a15a9f9` by #531.

- **The version drift the setup plan's test records.** README.md said
  12.0.1 while package.json pinned 12.0.2.
