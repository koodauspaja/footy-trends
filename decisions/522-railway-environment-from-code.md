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
| The command stops unless the environment holds no service | `refusal`, `scripts/railway-environment-plan.ts` | Building into anything that exists: production holds four services, staging three |
| The environment is read twice: before it is linked, and again before the first write | `standUp`, `scripts/railway-environment-steps.ts` | An environment that gained a service in between |
| No argument list carries `--confirm-destructive` | `railway`, same plan file | The CLI refuses a deletion in a non-interactive run without it; an empty environment has nothing to delete |
| The Railway token is a secret of the `railway-provisioning` GitHub Environment, with required reviewers | GitHub settings (`docs/setup/026`) | A run that nobody approved reading the token |

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
| A second partial, not one file with two shapes | Measured: `footy-trends` and `footy-trends-databases` coexist in one environment, each owning what its file declares, and each file plans clean afterwards |
| The region is `europe-west4`, the short name | Measured both ways. With the short name the CLI creates Railway's own templates: `redis:8.2` with its start command and `REDIS_URL`. With the stored name of the same place, `europe-west4-drams3a`, it creates `railwayapp/redis:8.2` with no variables at all, `REDIS_URL` resolves to nothing, and `/api/health` reports Redis unreachable. The cost of the short name is that a second plan shows `Move database … to europe-west4`, which the CLI counts as destructive; the file is applied once and throws when planned by hand, so that plan is never made |
| A new environment is shaped as staging: it restricts sign-in, and may sleep | Staging is the shape for anything that is not production. `AUTH_ALLOWED_EMAILS` is required, because without a list any Google account may sign in (#314) |
| An environment named `production` gets no `AUTH_ALLOWED_EMAILS` | `.railway/railway.ts` does not declare it there, so the next apply would delete it. A fork's production is open, as this one is |
| The branch is a variable read by the file, not an argument | `railway config apply` takes none. A later plan or apply of that environment needs the same variable, or the file throws |
| `staging` and `production` ignore the branch | Theirs are in the file (`main`, `release`), for a fork as for this project |
| Variables are set with `railway variable set --stdin`, not declared with values | `.railway/railway.ts` declares each by name with `preserve()`, so no value is in the repository. Measured: `preserve()` on a variable that does not exist creates nothing and plans clean, and a value set afterwards is kept |
| `DATABASE_URL`, `REDIS_URL` and `BETTER_AUTH_URL` are references | `${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}` and `https://${{RAILWAY_PUBLIC_DOMAIN}}`: Railway resolves them inside the environment, so the script reads no address and no password |
| `BETTER_AUTH_SECRET` is `randomBytes(32)`, made by the script | `ctx.randomString` answered the same value twice for one label. Not shown to be a secret, so not used as one |
| Google's two are required; TASO's key, Axiom's two and Sentry's DSN are optional | The build fails without `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and Google's pair: `src/lib/auth.ts` throws at load. The others are read when used. Setting them up is manual work per environment (`docs/setup/026`) |
| Every required key is checked before anything is created | A run that fails on a missing key leaves nothing behind |
| The command ends by asking `/api/health`, for up to fifteen minutes | "The environment exists" is not the claim; "its site reaches its database and Redis" is |
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

## What stays manual

| What | Why |
|---|---|
| Google: the new site's redirect URI | Registered per address in Google Cloud Console. Sign-in fails until it is; the site and `/api/health` work without |
| Axiom and Sentry | A dataset, a token and a DSN are each environment's own, made in their consoles. The command sets them when they are in its environment, and the workflow passes none: sharing staging's would mix a new environment's lines into staging's. Set in Railway afterwards, which is safe: `.railway/railway.ts` already lists the names |
| The three settings that let staging sleep | Dashboard-only (`docs/infrastructure.md`, *Staging sleeps*). Without them a new environment has the switch on and stays awake |
| Rotating a key | It is in two places: the GitHub secret, which only new environments read, and each Railway environment that holds it |

## Not established here

- The first deploy, started by applying the web service, fails its build: the
  variables are not set yet. The command's own deploy follows it. Whether the
  failed one can be avoided was not looked into.
- The football-data key is shared: another environment draws on the same ten
  requests a minute.
