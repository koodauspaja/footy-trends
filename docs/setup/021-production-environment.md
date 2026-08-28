# 021 — Production environment

## Goal
Stand up a production Railway environment separate from staging, with its own
database, its own cache, and its own credentials — and record the configuration
decisions that only start to matter once real users and real log volume are
involved.

Complete this after `019-railway-config.md`. By then `railway.toml` is the
source of truth for deploy behaviour, so production inherits it rather than
needing its own dashboard configuration.

This document covers **what production is configured as**. How code is promoted
into it — release CI, tags, rollback — is a separate concern; see the *Deploy
source* section for the boundary and what is deliberately missing until then.

---

## Before you start

Two things already exist and are assumed here:

| | |
|---|---|
| **Staging environment** | Deploys from `main`. Working. |
| **`release` branch** | Created from `main` and protected: PR required, 1 approving review, merge commits only, no force-push, no deletion. |

The single approving review is the release gate. GitHub does not let anyone
approve their own pull request, so a promotion to `release` always takes both
people. That is the mechanism — there is no separate process step to remember.

---

## What differs between the two environments

Everything about the application is identical; only the surroundings differ.

| | Staging | Production |
|---|---|---|
| Deploys from | `main` | `release` |
| PostgreSQL | its own | its own, separate |
| Redis | its own | its own, separate |
| Credentials | staging set | **no value shared with staging** |
| Deploy config | `railway.toml` | the same `railway.toml` |

Sharing a database or a provider key between the two is the failure this
separation exists to prevent: a staging migration or a rate-limit exhaustion
would otherwise take production with it.

---

## Step 1 — Create the environment

1. Railway → project → environment selector → **New Environment**
2. Name it `production`
3. Base it on `staging` so the service and its settings are copied

Creating from staging copies service configuration but **not** variable
*values* you will override below. Treat every variable as unset until Step 4
says otherwise.

---

## Step 2 — Provision its own PostgreSQL and Redis

Inside the `production` environment:

1. **New** → **Database** → **PostgreSQL**
2. **New** → **Database** → **Redis**

Railway injects `DATABASE_URL` and `REDIS_URL` into the environment
automatically once each is attached to the app service. Confirm both point at
the new instances and not at staging's — this is the single most damaging thing
to get wrong here, and the URLs are similar enough to miss at a glance.

---

## Step 3 — Point production at the `release` branch

1. Railway → `production` environment → app service → **Settings** → **Source**
2. Set the deploy trigger branch to `release`

The branch is a dashboard setting per environment. It is **not** expressible in
`railway.toml` — config-as-code covers build and deploy behaviour, not branch
selection — so this step cannot be version-controlled and has to be verified by
looking.

Then confirm the separation holds in both directions:

- a push to `main` deploys **staging only**
- a merge to `release` deploys **production only**

---

## Step 4 — Set the environment variables

Ten variables are read by `src/`. Two are injected by Railway once the
databases are attached; the other eight are set by hand.

| Variable | Source | Note |
|---|---|---|
| `DATABASE_URL` | Railway | From this environment's PostgreSQL |
| `REDIS_URL` | Railway | From this environment's Redis |
| `FOOTBALL_DATA_API_KEY` | manual | Its own key, not staging's — see below |
| `FOOTBALL_DATA_EARLIEST_SEASON` | manual | Bounded by the football-data.org plan |
| `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` | manual | |
| `TASO_API_KEY` | manual | See *TASO key* below |
| `NEXT_PUBLIC_SENTRY_DSN` | manual | |
| `AXIOM_TOKEN` | manual | |
| `AXIOM_DATASET` | manual | A separate dataset from staging, so the two do not interleave |
| `LOG_LEVEL` | manual | See Step 6 |

### Not set here

`.env.example` also lists `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`NEXTAUTH_SECRET` and `NEXTAUTH_URL`. Nothing in `src/` reads any of them —
they belong to the authentication work that has not shipped. Leave them unset
rather than provisioning credentials nothing consumes; an unused secret is
still a secret to rotate and leak.

### On separate provider keys

football-data.org enforces a per-key rate limit. A shared key means staging's
traffic can exhaust production's quota, which surfaces as production pages
failing to load for reasons nothing in production caused. Use a distinct key if
the plan allows more than one; if it does not, record that as an accepted risk
here rather than leaving it implicit.

### TASO key

`020-taso-api-key.md` documents this key as **scraped from a browser session,
not issued**. It can stop working without notice and has a manual re-scrape
procedure. Production depending on it is an availability risk worth naming
before real users do: when it expires, Veikkausliiga data fails in production
until someone repeats the scrape by hand.

---

## Step 5 — Settle the Sentry configuration

`sentry.server.config.ts` currently ships three development defaults into every
environment:

```ts
tracesSampleRate: 1,
enableLogs: true,
sendDefaultPii: true,
```

These are **code**, not configuration, so staging and production get the same
values. Differing per environment requires reading them from environment
variables first — a small change to `sentry.server.config.ts`, and the one
application code change this environment work implies.

| Setting | Now | Recommended in production | Why |
|---|---|---|---|
| `tracesSampleRate` | `1` | `0.1` | 100% tracing ties Sentry quota directly to traffic. At today's volume the cost is small, but the exposure is a traffic spike burning a month's quota in a day. Sampling bounds it. |
| `sendDefaultPii` | `true` | `false` | Sends IP addresses and request headers to a third-party processor. There are no user accounts yet, so almost nothing is gained, and it is a GDPR question that should be answered deliberately rather than inherited from a wizard default. |
| `enableLogs` | `true` | `false` | Logs already ship to Axiom (`009-axiom-logs.md`). Leaving this on gives two log destinations, two bills, and two places to search. Keep Axiom for logs and Sentry for errors. |

### These cannot be applied from the Railway dashboard yet

Setting a variable in Railway does nothing on its own: `sentry.server.config.ts`
hardcodes all three, so production runs the development defaults regardless of
what is set. **Do not tick the Sentry item in *Done when* until the code below
exists** — otherwise the checklist reads as complete while production traces
100% of requests and ships PII.

The change is small and value-neutral — it reads each setting from the
environment, keeping today's behaviour as the fallback, so nothing changes until
a variable is actually set:

```ts
tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1),
enableLogs: process.env.SENTRY_ENABLE_LOGS !== "false",
sendDefaultPii: process.env.SENTRY_SEND_DEFAULT_PII !== "false",
```

Then production sets:

| Variable | Value |
|---|---|
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` |
| `SENTRY_ENABLE_LOGS` | `false` |
| `SENTRY_SEND_DEFAULT_PII` | `false` |

Record the values actually chosen here, with the reasoning, once agreed —
the reasoning is the part that stops the next person re-litigating it.

---

## Step 6 — Set `LOG_LEVEL`

`src/lib/logger.ts` defaults to `info` in production and `debug` elsewhere.

**Recommended: `info`.** It is worth understanding why this is safe rather than
assuming it, because "info in production" is usually the wrong answer.

Three paths in `src/` log at `info` through the Pino logger. None of them
scales with user traffic:

- `src/lib/provider-request.ts`, once per *outbound provider request*. Every
  provider response is cached, so this is bounded by **cache misses, not user
  traffic** — a busy day does not multiply it.
- `src/app/api/health/route.ts`, once per request to it. Railway probes
  `healthcheckPath` only while gating a new deployment and stops once the
  deploy is live, so this is per-deploy volume plus whatever hits it by hand.
- `src/app/api/sentry-example-api/route.ts` and
  `src/app/sentry-example-page/page.tsx`, the Sentry wizard's scaffolding.
  These are reachable in production and worth deleting rather than tuning —
  they exist to prove the integration once, not to ship.

Everything else in `src/` logs at `warn` or `error`.

If Axiom volume does become a cost, the lever is the provider-request log line,
not the global level — dropping to `warn` would also discard the warnings that
make provider failures diagnosable.

---

## Step 7 — Confirm `railway.toml` applies

Production inherits the repo's `railway.toml` unchanged. Confirm on the
deployment details page that these come from the file, not the dashboard:

- `preDeployCommand = "npm run db:migrate"` — migrations run **before** the new
  container takes traffic
- `healthcheckPath = "/api/health"`, `healthcheckTimeout = 60`
- `overlapSeconds = 15`, `drainingSeconds = 10` — zero-downtime handover
- `restartPolicyType = "ON_FAILURE"`, max 3 retries

If production ever needs a value staging does not, `railway.toml` supports
per-environment overrides under an `environments.<name>` block, resolved
environment-specific first, then base config, then dashboard settings. Prefer
that over a dashboard edit, so the difference stays in version control.

### Migrations are forward-only

`preDeployCommand` runs `npm run db:migrate` on every deploy. Redeploying an
earlier commit does **not** roll the schema back. A bad migration is recovered
by writing a new one, not by redeploying — worth knowing before the first
production incident rather than during it.

---

## Step 8 — First deploy and verify

1. Merge something into `release` through a pull request (the 1-approval gate)
2. Watch the production deploy log
3. Confirm `npm run db:migrate` runs before the server starts
4. Confirm the health check passes and the deploy goes live
5. Check the response body:

```sh
curl -s https://<production-domain>/api/health | jq
```

Expect `status: "ok"` with `checks.database: "ok"` and `checks.redis: "ok"`
— both sit under `checks`, not at the top level. Add
`?providers=1` to include a live TASO check — it is opt-in precisely because a
probe should not call a provider on every request.

Then confirm the isolation actually holds:

- production's `DATABASE_URL` is not staging's
- production's `REDIS_URL` is not staging's
- writing to staging's database leaves production's untouched

---

## Deploy source, and what is deliberately missing

Production deploys on any push to `release`. Since `release` cannot be pushed
to directly — PR and one approval are required — that is a real gate, but it is
a **human** one: nothing yet checks that the tests pass before production
takes the code.

Railway's **Wait for CI** setting is what closes this, holding a deployment in
`WAITING` until GitHub workflows finish and marking it `SKIPPED` if any fail.
It cannot be enabled yet: the toggle only appears when a workflow has a `push`
trigger for the tracked branch, and no release workflow exists. Enable it as
part of that work, not here.

Also deliberately out of scope: release CI (unit, integration and e2e against
the release branch), version tagging, rollback procedure, and custom
domains/DNS/TLS.

---

## Recreating this environment from scratch

1. Create a `production` environment based on `staging` (Step 1)
2. Attach a new PostgreSQL and Redis (Step 2)
3. Set the trigger branch to `release` (Step 3)
4. Set the eight manual variables; confirm Railway injected the two database
   URLs and that they point at this environment's instances (Step 4)
5. Apply the Sentry and log-level values recorded in Steps 5 and 6
6. Merge to `release` and verify the deploy, migrations and health check
   (Step 8)

Nothing here depends on state that exists only in the dashboard except the
trigger branch and the variable values — everything else comes from
`railway.toml` in the repo.

---

## Done when
- [ ] `production` environment exists, separate from staging
- [ ] It has its own PostgreSQL and Redis, and neither URL matches staging's
- [ ] Its trigger branch is `release`; a push to `main` deploys staging only
- [ ] All ten required variables are set, with no value shared with staging
- [ ] The auth variables are deliberately left unset
- [ ] `sentry.server.config.ts` reads its three settings from the environment
      (prerequisite — without it the next box cannot be true)
- [ ] Sentry `tracesSampleRate`, `sendDefaultPii` and `enableLogs` are decided,
      applied, and recorded above with reasoning
- [ ] `LOG_LEVEL` is decided and recorded
- [ ] A deploy runs migrations before taking traffic and passes its health check
- [ ] `/api/health` returns `ok` for database and redis in production

## Next
→ The release workflow — release CI, Wait for CI, version tagging and rollback.
