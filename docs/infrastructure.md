# Infrastructure map

How the running system is set up **now**: what exists, where each part is
configured, what differs between staging and production, and the constraints
that are easy to break. For anyone, human or agent, deciding something about
the system.

- **Not a procedure.** Standing the system up from zero is `docs/setup/`.
- **Not history.** Why a thing is the way it is: the linked issue or decision
  record.
- **Kept true by one rule: a change to infrastructure updates this file in the
  same pull request.** A fact here that the live system contradicts is a bug in
  this file; fix it when you find it.

Checked against the live system on **2026-10-02** (#524). Each section says how
it was read, so it can be read again.

## At a glance

| | Staging | Production |
|---|---|---|
| URL | `footy-trends-staging.up.railway.app` | `footy-trends.up.railway.app` |
| Deploys from | `main`, on every push that touches a watched path | `release`, after `release.yml` is green |
| Who can sign in | the addresses in `AUTH_ALLOWED_EMAILS` | any Google account |
| Google OAuth project | `footy-trends` (Testing) | `footy-trends-prod` (Published) |
| Postgres, Redis, Sentry DSN, Axiom token and dataset | its own | its own |
| Provider API keys | **shared**: one football-data key and one TASO key serve both | |
| Hourly predictions cron | none | `predictions` service |
| Volumes | 500 MB each | 5 GB each |

## Railway

Project `footy-trends`, workspace `Koodauspaja's projects`. Read with
`railway status --json`; variables by name with `railway variables --json`.

| Service | In | Source | Region | Configured in |
|---|---|---|---|---|
| `footy-trends` (web) | both | this repository, the environment's branch | `europe-west4` | `.railway/railway.ts`, applied per environment (`docs/setup/025`) |
| `Postgres` | both | image `postgres-ssl:18`, volume at `/var/lib/postgresql/data` | `europe-west4` | dashboard |
| `Redis` | both | image `redis:8.2.9`, volume at `/data` | `europe-west4` | dashboard. Staging's start command ends `--tcp-keepalive 0` (*Staging sleeps*) |
| `predictions` (cron) | production | this repository, `release` | `europe-west4` | dashboard (`docs/setup/024`) |

**Every service is in one region, and a new one must be put there by hand.**
Railway does not choose it: Redis ran in `sfo` until 2026-10-02, an ocean from
the app that reads it on every request, because the setup step set no region
(`docs/setup/016` does now).

### The web service

Every setting is in `.railway/railway.ts`; `tests/unit/railway-config.test.ts`
pins each value.

| Setting | Value |
|---|---|
| Before traffic | `npm run db:migrate` (migrations are forward-only: redeploying an older commit does not roll the schema back) |
| Start | `node node_modules/next/dist/bin/next start`, not `npm start`: under npm the server never received Railway's SIGTERM (#525) |
| Health check | `/api/health`, 60 s. It checks Postgres and Redis and reports the running commit |
| Restart | on failure (Railway's default, deliberately not declared), at most 3 times |
| Handover | 15 s overlap, then 10 s draining |
| Redeploys on | `src/**`, `public/**`, `drizzle/**`, `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`. A docs-, spec-, test- or workflow-only push deploys nothing |
| Wait for CI | production only |
| Sleeps when idle | staging only (`sleepApplication`). It needs the three settings under *Staging sleeps* to happen at all |

Constraints:

- **Railway never reads `.railway/railway.ts` during a deploy.** A change takes
  effect only when applied, once per environment (`docs/setup/025`).
- **A `railway.toml` on the deployed branch wins over the applied settings.**
  Railway reads the file first while it exists (a deployment's metadata says
  `configFile: /railway.toml`). `main` lost it in #523; `release` carries it
  until the release after v1.13.0, so until then production deploys with that
  file's values, `npm start` among them, whatever has been applied (#525).
- **An apply removes whatever the file does not declare.** The service's source
  and every variable are declared for that reason. **A variable added in the
  dashboard must be added to the file before the next apply**, or that apply
  deletes it. Always `railway config plan` first; stop on any deletion (#521).
- **Only `staging` and `production` evaluate.** Any other environment name
  throws. A new environment is #522.
- **A red release run leaves production on the previous version**, and Railway
  marks the deployment `SKIPPED`. Re-running the workflow does not restart the
  deploy; press **Redeploy** in Railway (#215).
- **A replaced deployment goes from `SUCCESS` to `REMOVED`.** Its log ends
  `sending signal SIGTERM to container`, `Stopping Container`, with no
  `npm error`: Next closes the server and finishes pending requests. `CRASHED`
  on a deployment now means a crash (#525).

### Variables of the web service

By name; no value is in the repository. The lists are in `.railway/railway.ts`.

| Variable | Staging | Production | Note |
|---|---|---|---|
| `DATABASE_URL`, `REDIS_URL` | set | set | references to that environment's own Postgres and Redis. Staging's each end in a query string, see *Staging sleeps* |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | set | set | per environment |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | set | set | from that environment's Google project |
| `FOOTBALL_DATA_API_KEY`, `TASO_API_KEY` | set | set | **the same key in both** |
| `FOOTBALL_DATA_EARLIEST_SEASON`, `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` | `2023`, `3600` | `2023`, `3600` | how far back history is stored, and how old stored matches may be before a refresh |
| `AXIOM_TOKEN`, `AXIOM_DATASET` | dataset `footy-trends` | dataset `footy-trends-prod` | a token per environment |
| `NEXT_PUBLIC_SENTRY_DSN` | set | set | per environment |
| `LOG_LEVEL` | `info` | `info` | why `info` is safe: `docs/setup/021` |
| `AUTH_ALLOWED_EMAILS` | set | absent | unset means anyone may sign in |
| `AUTH_CLIENT_IP_HEADERS`, `AUTH_TRUSTED_PROXIES` | present, **empty on purpose** | absent | the default, `x-real-ip`, is right behind Railway's edge (decisions/309) |
| `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_SEND_DEFAULT_PII`, `SENTRY_ENABLE_LOGS` and their `NEXT_PUBLIC_` copies | absent | set | production: 0.1, false, false. Absent means the wizard's defaults: 1, true, true |

The `predictions` service holds its own: `DATABASE_URL`, `REDIS_URL`, the two
provider keys, `FOOTBALL_DATA_EARLIEST_SEASON`, `AXIOM_TOKEN`, `AXIOM_DATASET`
and `NODE_ENV`.

### Staging sleeps

Staging's web service is asleep unless someone is using it, which stops it
being charged for memory it holds idle (#551). Railway puts a service to sleep
5 to 10 minutes after its **last outbound packet**, and wakes it on the next
request. Production never sleeps.

**Four settings, all on staging, and it stays awake if any one is missing.**
Each was found by reading the service's network flow log
(`railway logs -s footy-trends -e staging --network`):

| Setting | Where | What it silences |
|---|---|---|
| `sleepApplication: true` | `.railway/railway.ts`, staging's entry | nothing: it is the switch |
| `DATABASE_URL` is `${{Postgres.DATABASE_URL}}?idle_timeout=20` | the web service's variable, dashboard | `postgres` 3.4.9 keeps idle connections open and sends a TCP keepalive on each every 60 s (its defaults: `idle_timeout` none, `keep_alive` 60); with this it closes them after 20 idle seconds. `idle_timeout` is a documented option, and the library reads options from the address |
| `REDIS_URL` is `${{Redis.REDIS_URL}}?keepAlive=off` | the web service's variable, dashboard | ioredis sends a keepalive every 30 s. It turns them on only when the option is a number, and a value from the address arrives as text. Read in the source of the pinned `ioredis` 6.0.0 (`built/Redis.js`, `typeof options.keepAlive === "number"`) and seen in the flow log, where the 30 s packets stopped; it is that version's behaviour, not a documented switch, and the option has no documented "off" |
| `--tcp-keepalive 0` at the end of the start command | the `Redis` service, dashboard | the Redis server probes each client every 300 s, and the app's reply is an outbound packet |

Measured on 2026-10-05: asleep 10.5 minutes after the last packet; the first
request after that answered 200 in 1.7 s, with no 502, and `/api/health` then
reported the database and Redis reachable.

- **The two variables are values, and the file keeps them.** `.railway/railway.ts`
  declares both with `preserve()`, so an apply leaves the query strings alone. A
  staging rebuilt from zero needs them set again by hand.
- **An upgrade of `ioredis` or `postgres` can undo it** (6.0.0 and 3.4.9 when
  this was measured). `tests/unit/lib/staging-sleep-settings.test.ts` pins what
  the two query strings rely on, so a Renovate bump that changes it fails
  there. If staging stops sleeping anyway, the flow log shows which connection
  is talking.
- **A request wakes it**, from the internet or from another service in the
  project. Nothing scheduled runs on staging.

### The predictions cron

`npm run predictions -- log`, hourly on the hour (UTC), production only
(specs/052). It skips `next build`. It writes `live` rows to `predictions`.
`backtest` rows are written by hand, per environment, after any release that
adds a model: `DATABASE_URL=<that environment> npm run predictions -- backtest`,
from a checkout of the commit that environment runs.

## Databases

| | Staging | Production | Local | Tests |
|---|---|---|---|---|
| Postgres | Railway, v18 | Railway, v18 | `docker-compose.yml`, `postgres:18-alpine` | the local server, database `<name>_test` (decisions/304) |
| Redis | Railway, 8.2 | Railway, 8.2 | `docker-compose.yml`, `redis:8-alpine` | the local one; integration tests mock the cache |

- **Schema:** `src/db/schema.ts`; migrations in `drizzle/`, named
  `<verb>_<what>`, never edited once applied anywhere (CLAUDE.md).
- **Redis holds two things:** the cache (`getCached`, JSON, TTL per key) and
  better-auth's rate-limit counters (decisions/318). A Redis outage must not
  take sign-in down; that record says how it does not.
- **History is filled by a backfill, not by traffic** (`docs/setup/022`). A new
  column on stored matches needs `npm run backfill -- --refetch` in each
  environment after its migration has deployed.
- **The suites never touch the development database.** `npm run
  test:integration` and `npm run test:e2e` create and migrate `<name>_test`;
  e2e serves on port 3001.

## GitHub

Repository `koodauspaja/footy-trends`, **public**. Read with `gh api
repos/:owner/:repo/rulesets` and its neighbours.

### Rulesets

| | `main` | `release` |
|---|---|---|
| Pull request required | yes, 0 approvals | yes, **1 approval** |
| Merge methods | squash, merge or rebase; history must stay linear | **merge commit only**, so `release` keeps `main`'s SHAs |
| Up to date before merge | required | **not** required (#221) |
| Required checks | `Typecheck, lint and unit tests`, `Integration tests`, `Issue checkboxes`, `SonarCloud scan`, `Sourcery review` | `Release — typecheck, lint and unit tests`, `Release — integration tests`, `Release — end-to-end tests` |
| Force push, deletion | blocked | blocked |

- **A required check is satisfied by `skipped`.** Sourcery skips when its
  budget is out, and the CI jobs skip for any actor outside the allowlist. A
  green merge box proves neither review nor CI (`docs/setup/011`).
- **Renaming a CI job blocks every merge** until the ruleset names the new one.
- **GitHub closes an issue on any `Closes #N`** in a pull request body or a
  merged commit message, even in backticks or prose.

### Workflows

| File | Runs on | Jobs | Notes |
|---|---|---|---|
| `ci.yml` | push to `main`, pull requests to `main` | unit (typecheck, lint, unit, shuffled unit), integration (Postgres 18 and Redis 8 as services), issue checkboxes | only for `OWNER_USERNAME`, `COLLABORATOR_USERNAME` and `renovate[bot]` |
| `sonarcloud.yml` | the same | scan, with coverage; the job waits for the quality gate | the same allowlist |
| `release.yml` | pull requests to `release`, push to `release`, by hand | unit, integration, **e2e against a production build**, then tag and publish on a push | uses the two provider keys; e2e runs nowhere else in CI |
| `taso-key-check.yml` | daily 06:00 UTC, by hand | asks production's `/api/health?providers=1` whether TASO still answers | #113 |

- **Every workflow's token is `contents: read`**, and a job widens only what it
  needs: the issue-checkbox job reads issues and pull requests, the Sonar job
  reads pull requests, the release's tag job writes contents.
- **Every job has a timeout**, three to four times its longest recent run
  (measured 2026-10-05).
- **A pull request's newer run cancels its older one** in `ci.yml`,
  `sonarcloud.yml` and `release.yml`. A push to `main` or `release` has a
  concurrency group of its own per commit, so it is never cancelled or evicted
  (#537).

Actions variables: `OWNER_USERNAME`, `COLLABORATOR_USERNAME`,
`FIRST_RELEASE_VERSION`. Secrets: `SONAR_TOKEN`, `FOOTBALL_DATA_API_KEY`,
`TASO_API_KEY`. `SONAR_ORGANIZATION` and `SONAR_PROJECT_KEY` also exist as
secrets and nothing reads them: the values are in `sonar-project.properties`.
Workflows from forks need approval for all outside contributors.

### Versions and releases

The version is an annotated tag, created by `release.yml` after a merge to
`release` is green; it is not in `package.json`. `skills/release.md` is the
procedure. `/api/health` reports the commit production runs; the tag on that
commit is the version.

### The board

Organization project `Footy Trends` (number 2), private. Status: `Backlog`,
`Ready`, `In Progress`, `In Review`, `Done`.

- **The names are read by code.** `scripts/release-pr-plan.ts` finds the status
  options by name; renaming a column breaks `npm run release:pr`.
- **Nothing adds an issue to the board.** Every new issue is added by hand and
  set to `Backlog`. Merging a pull request moves its card to `Done`.
- **Every issue has a kind label and the matching Issue Type** (`enhancement` →
  Feature, `chore` → Task, `bug` → Bug) and domain labels, which the release
  notes and the release pull request's labels are built from
  (`docs/setup/002`).
- **Only a human moves a card to `Ready`**, or tells the agent to (CLAUDE.md).

## Review and analysis

| Tool | Configured in | Constraints |
|---|---|---|
| Sourcery | rules in its dashboard, mirrored and explained in `REVIEW_RULES.md`; `.sourcery.yaml` only enables the defaults | Pro plan: 300 000 diff characters per pull request, 1 500 000 per seat per rolling 7 days. Out of budget it posts a notice and the check still passes. A later push gets a lighter re-check; a bare `@sourcery-ai review` comment forces a full one (`docs/setup/004`, `skills/open-pr.md`) |
| SonarCloud | `sonar-project.properties`, `sonarcloud.yml` | indexes the whole repository, so a source file no test imports scores 0%; `npm run test:unit` fails on such a file first (CLAUDE.md) |
| Renovate | `renovate.json` | Mondays before 07:00 Helsinki, at most 10 open, no automerge. TypeScript is held below 7 (#43) |
| Local gate | `npm run verify`, the pre-commit hook (lint, typecheck) and the pre-push hook (a fresh e2e run for changed files) | the stages are checked against the workflows by a unit test |

## Observability

| | Where | Constraints |
|---|---|---|
| Errors | Sentry: `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`, all reading `src/lib/sentry-config.ts` | three files, and the browser needs `NEXT_PUBLIC_` copies of each setting. A blank variable means unset, not zero |
| Logs | Pino with the `@axiomhq/pino` transport (`src/lib/logger.ts`), one dataset per environment | **Policy (2026-10-04): deploy-time failures show in Railway's log; everything the app does goes to Axiom.** With Axiom configured, the app's logger writes to Axiom only, so Railway's log holds the build, the migrations and Next's startup lines, and nothing from the running app. `info` logs once per outbound provider request and once per health check, so volume follows cache misses, not traffic (`docs/setup/021`). Logging is not yet a feature requirement, and some writes leave no record (#538) |
| Health | `/api/health`; `?providers=1` also asks TASO | `?providers=1` is an uncached provider call: not for a short-interval monitor |

## Sign-in

better-auth with Google, signed-in features gated by `canSeeAnalytics()`.

- **Two Google Cloud projects** (#264): `footy-trends` (Testing) for local and
  staging, `footy-trends-prod` (Published) for production. Publishing status
  belongs to a project, not a client.
- **Google's test-user list restricts nothing** for the three basic scopes this
  app requests. Staging's restriction is `AUTH_ALLOWED_EMAILS`, in the app
  (#314).
- **The first admin of an environment is granted by hand**, in the database
  (`docs/setup/023`); after that, admins manage roles at `/yllapito`.
- **Rate limiting needs the client's address**, read from `x-real-ip`, which
  Railway's edge overwrites (decisions/309).

## Data providers

| Provider | Key | Constraints |
|---|---|---|
| football-data.org | registered, free tier (`docs/setup/007`) | 10 requests a minute **per key**, and the key is shared by staging, production, local e2e runs and the backfill. Every response is cached (REVIEW_RULES.md) |
| TASO (Palloliitto) | **scraped from a browser session, not issued** (`docs/setup/020`) | it can stop working without notice, in both environments at once; `taso-key-check.yml` asks daily. Access on Palloliitto's own terms is #307 |

## What the scripts assume

A change to the thing on the left needs the script on the right checked.

| Thing | Script |
|---|---|
| The board's status names | `scripts/release-pr-plan.ts` |
| The local services in `docker-compose.yml` | `scripts/services-plan.ts`, `scripts/ensure-services.ts` |
| The test database's name ending in `_test` | `scripts/with-test-db.ts`, the integration suite's global setup |
| The checkbox and reason shape on issues | `scripts/issue-boxes-plan.ts` |
| Conventional commit subjects | `scripts/next-version.ts`, the release notes |
| CI's stages | `npm run verify`, compared with the workflows by a unit test |
