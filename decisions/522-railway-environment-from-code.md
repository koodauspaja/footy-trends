# 522 — A new Railway environment from code: decisions

Chore #522. `npm run railway:environment -- --name=<name>` builds an
environment from nothing: its own Postgres and Redis, the web service wired to
them, its variables, and a first deploy that answers `/api/health`.
`railway-environment.yml` runs the same command with the keys from GitHub
secrets. Two uses: someone who has forked the repository standing up their
first environment, and a short-lived environment for one branch in this
project.

Overrides one line of `decisions/521-railway-infrastructure-as-code.md`: *only
the named environments evaluate*. `.railway/railway.ts` now also evaluates for
any other name when `RAILWAY_NEW_ENVIRONMENT_BRANCH` is set, and still throws
when it is not.

## What cannot reach staging or production

The requirement was that this can never overrun production. Each row holds on
its own.

| Guard | Where | What it stops |
|---|---|---|
| The databases are in a file of their own, `.railway/databases.ts`, under their own partial | the file | `.railway/railway.ts`, the file staging and production are applied from, declares no database on any path, so no apply of it can plan one's deletion |
| The databases file throws for this project's staging and production, by environment id | the file | An apply by hand, linked to either, whatever variables are set |
| The databases file throws unless `RAILWAY_NEW_ENVIRONMENT_ID` is the linked environment's id | the file | An apply by hand anywhere, and a script whose link points somewhere other than the environment it checked |
| `.railway/railway.ts` throws when `RAILWAY_NEW_ENVIRONMENT_ID` is set and is not the linked environment's id | the file | The command tells both files the one id. A link that moved between its two applies, to production included, stops the second |
| The command stops unless the environment holds no service | `refusal`, `scripts/railway-environment-plan.ts` | Building into anything that exists: production holds four services, staging three |
| The command stops when the project already holds a service named `Postgres-<name>` or `Redis-<name>` | `collision`, same plan file | The bare instance described below, before anything is created |
| The environment is read twice: before it is linked, and again before the first write | `standUp`, `scripts/railway-environment-steps.ts` | An environment that gained a service in between |
| No argument list carries `--confirm-destructive` | `railway`, same plan file | The CLI refuses a deletion in a non-interactive run without it; an empty environment has nothing to delete |
| The Railway token is a secret of the `railway-provisioning` GitHub Environment, with required reviewers | GitHub settings (`docs/setup/026`) | A run that nobody approved reading the token |

**An empty environment is a target, whatever it is called.** If this
project's production were deleted and made again, it would have a new id and
hold nothing, and the command would build into it, as it would into a fork's
first `production`. The ids protect the two environments that exist; nothing
protects a name.

**Approving a run gives a branch the keys.** An environment for a branch runs
that branch's code with the Google client, the provider keys and the sign-in
list. The reviewer who approves the run is approving that, as merging to `main`
approves it for staging.

**What no guard covers: the token itself.** A Railway project token is tied to
one environment and cannot create another, so the workflow holds a workspace
token, and that token can change production. The guards limit what this
command does with it, not what it can do. The approval on the GitHub
Environment is the only thing between the token and a workflow somebody edited.

## Why it is shaped this way

| Decision | Why |
|---|---|
| The databases are declared for a new environment only, never for an existing one | A partial owns what it declares. Declared in `.railway/railway.ts`, a database would be deleted by the next apply of any version that left it out, and staging's and production's hold data. Theirs stay in the dashboard, as #521 left them |
| "Protected" is an environment id and an empty-check, not the names `staging` and `production` | Railway creates every project with an empty `production`. In a fork that is a legitimate target, and a name check would refuse it |
| A second partial, not one file with two shapes | Measured: `footy-trends` and `footy-trends-databases` coexist in one environment, each owning what its file declares, and both files plan clean afterwards |
| The databases are named after the environment: `Postgres-<name>`, `Redis-<name>` | In Railway a service belongs to the project, and an environment holds an instance of it. Measured: declared under a name the project has never held, the CLI builds Railway's own database (`redis:8.2`, its start command, `REDIS_URL`). Declared as `Redis` where the project already had one, it added an instance of that service from the SDK's defaults (`railwayapp/redis:8.2`, no variables), `REDIS_URL` resolved to nothing, and `/api/health` reported Redis unreachable. Seen in two environments, with either spelling of the region. A name of its own also means a new environment in this project shares no service with the `Postgres` and `Redis` production runs on |
| The region is `europe-west4-drams3a` | Railway's stored name. Measured: with `europe-west4` the database is created in that same place, and every later plan shows `Move database … to europe-west4`, which the CLI counts as destructive |
| A new environment is shaped as staging: it restricts sign-in, and may sleep | Staging is the shape for anything that is not production. `AUTH_ALLOWED_EMAILS` is required, because without a list any Google account may sign in (#314) |
| An environment named `production` gets no `AUTH_ALLOWED_EMAILS` | `.railway/railway.ts` does not declare it there, so the next apply would delete it. A fork's production is open, as this one is |
| The branch is a variable read by the file, not an argument | `railway config apply` takes none. A later plan or apply of that environment needs the same variable, or the file throws |
| `staging` and `production` ignore the branch | Theirs are in the file (`main`, `release`), for a fork as for this project |
| A branch is checked for shape only, not for existing | Measured: Railway accepts `foo..bar` and a branch nobody pushed alike when the file is applied, and starts no deployment for either. So both end the same way, with a site that never answers and the command saying so, and no check of the name's shape tells the second apart |
| Variables are set with `railway variable set --stdin`, not declared with values | `.railway/railway.ts` declares each by name with `preserve()`, so no value is in the repository. Measured: `preserve()` on a variable that does not exist creates nothing and plans clean, and a value set afterwards is kept |
| `DATABASE_URL`, `REDIS_URL` and `BETTER_AUTH_URL` are references | `${{Postgres-<name>.DATABASE_URL}}`, `${{Redis-<name>.REDIS_URL}}` and `https://${{RAILWAY_PUBLIC_DOMAIN}}`: Railway resolves them inside the environment, so the script reads no address and no password |
| `BETTER_AUTH_SECRET` is `randomBytes(32)`, made by the script | `ctx.randomString` answered the same value twice for one label. Not shown to be a secret, so not used as one |
| Google's two are required; TASO's key, Axiom's two and Sentry's DSN are optional | The build fails without `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and Google's pair: `src/lib/auth.ts` throws at load. The others are read when used. Setting them up is manual work per environment (`docs/setup/026`) |
| Every required key is checked before anything is created | A run that fails on a missing key leaves nothing behind |
| The command ends by asking `/api/health`, sixty times, fifteen seconds apart | "The environment exists" is not the claim; "its site reaches its database and Redis" is. It is what found the Redis with no address: the deploy had succeeded. Each question may take twenty seconds to fail, so the worst case is thirty-five minutes, and the workflow's timeout is forty-five |
| The runner sets `_` to the CLI's path | The SDK checks the CLI's version by running whatever `_` names. A shell sets that to the command it ran; under `npm run` it names `npx`, and the SDK then reports the CLI as too old |
| The workflow checks out the default branch | The scripts and config files that run with the token are the reviewed ones. The `branch` input is only a name handed to Railway |
| The CLI is the release binary at a pinned version | The npm package fetches its binary in a lifecycle script, and the workflows install with `--ignore-scripts` |

## From code, or duplicated in the dashboard

| | From code | Duplicated (`docs/setup/021`, Step 1) |
|---|---|---|
| Needs | nothing: an empty project is enough | an environment to copy |
| Databases | new and empty | copies; whether rows come too must be checked |
| Variables | set fresh; its own `BETTER_AUTH_SECRET` | **the source's values**, its credentials and database references among them, each to be accounted for by hand |
| Dashboard-only settings (Redis' start command, the two query strings, the `predictions` service) | not set | copied |

From code is how a new environment is made. Duplication is for when the copy
must carry what only the dashboard holds, and then 021's audit of every
variable applies.

## What was run

In two projects made for the purpose and since deleted, from a laptop. In the
first the command created an environment beside three others that already held
a `Postgres` and a `Redis`; in the second, an empty project, it created
`staging`, as a fork would. Both ended with `/api/health` reporting the
database and Redis ok, and a second run into the second was refused. Afterwards both files planned clean there, and the web
service's file threw without its branch variable. Deleting that environment
removed its two database services from the project within half a minute and
left the other environments' services as they were.

Against this project, read-only: staging's and production's plans showed no
changes before and after; the databases file threw when planned linked to
production, with and without the target variable set to production's own id;
and the command, given `staging` and then `production`, stopped at its first
read.

## What stays manual

| What | Why |
|---|---|
| Google: the new site's redirect URI | Registered per address in Google Cloud Console. Sign-in fails until it is; the site and `/api/health` work without |
| Axiom and Sentry | A dataset, a token and a DSN are each environment's own, made in their consoles. The command sets them when they are in its environment, and the workflow passes none: sharing staging's would mix a new environment's lines into staging's. Set in Railway afterwards, which is safe: `.railway/railway.ts` already lists the names |
| The three settings that let staging sleep | Dashboard-only (`docs/infrastructure.md`, *Staging sleeps*). Without them a new environment has the switch on and stays awake |
| Rotating a key | It is in two places: the GitHub secret, which only new environments read, and each Railway environment that holds it |

## Not established here

- **`railway-environment.yml` has never run.** The command it runs was run from
  a laptop, logged in as a person, against a separate project made for the
  purpose. Not seen: the CLI authenticating with a workspace token, the
  workflow's link step listing environments with only `RAILWAY_PROJECT_ID`
  set, and the release binary on a runner. `RAILWAY_API_TOKEN` was stored on
  2026-10-09 and has not been used.
- A run that fails part-way leaves an environment that holds something, which
  the next run refuses. Deleting it and starting again is the way through;
  nothing resumes.

- The first deploy, started by applying the web service, fails its build: the
  variables are not set yet. The command's own deploy follows it. Whether the
  failed one can be avoided was not looked into.
- The web service is the project's one `footy-trends` service in every
  environment, by design: a new environment holds an instance of it, as
  staging and production do. Only its databases are services of its own.
- The football-data key is shared: another environment draws on the same ten
  requests a minute.
