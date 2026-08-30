# 021 — Production environment

## Goal
Stand up a production Railway environment separate from staging, with its own
database, its own cache, and its own credentials — and record the configuration
decisions that only start to matter once real users and real log volume are
involved.

This depends on `019-railway-config.md` being done: `railway.toml` is the
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

Duplicating an environment copies "services, variables, and configuration" —
**including the values**. Production therefore starts out holding *staging's*
credentials: staging's API keys, staging's Axiom token, and database variables
still referencing staging's instances.

Treat every variable as wrong until Step 4 has replaced it. The failure mode
here is silent: nothing errors, because staging's credentials work — production
just quietly reads and writes staging's data.

Railway stages the copied services for deployment rather than deploying them
immediately, so review the staged changes before approving; that pause is the
opportunity to fix the variables first.

---

## Step 2 — Confirm it has its own PostgreSQL and Redis, and only one of each

**If you duplicated staging, this environment already has its own PostgreSQL
and Redis** — duplication copies the services, and the copies are this
environment's own instances, not pointers to staging's. Do not add a second
pair. Two Postgres services in one environment is the state in which
`DATABASE_URL` can reference the one you are not looking at, and you pay for
both.

So:

1. Open the `production` environment and count what is there
2. Exactly one PostgreSQL and one Redis — **verify**, do not create
3. Nothing there (an empty environment rather than a duplicate) — **New** →
   **Database** → **PostgreSQL**, then the same for **Redis**

Then confirm `DATABASE_URL` and `REDIS_URL` resolve to *this* environment's
instances. Railway injects them once each database is attached to the app
service, but a duplicated environment can arrive with the variables already
populated, and a copied reference that still points at staging is exactly the
silent failure Step 1 warns about. The URLs are similar enough to miss at a
glance, so compare them against staging's rather than reading them alone.

One thing to check rather than assume: whether the duplicated database arrived
carrying staging's **data** as well as its configuration. Production starting
life with a copy of staging's rows is survivable, but only if you know it
happened — decide whether to keep or drop them before the first real deploy.

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

Both statements assume the change touches a watched path. `railway.toml`'s
`build.watchPatterns` covers `src/`, `public/`, `drizzle/`, the lockfile and a
few config files — so documentation-, spec-, decision-, test- and
`.github/`-only changes deploy **nothing**, by design. A docs-only merge to
`release` producing no deployment is correct behaviour, not a broken trigger.

---

## Step 4 — Set the environment variables

Ten variables are read by `src/` today. Two are injected by Railway once the
databases are attached; the other eight are set by hand. Step 5 adds six more
once the Sentry configs read their settings from the environment.

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

**Three** config files ship the same development defaults into every
environment — server, edge and client:

| File | Runs on |
|---|---|
| `sentry.server.config.ts` | Node server |
| `sentry.edge.config.ts` | middleware and edge routes |
| `src/instrumentation-client.ts` | the user's browser |

Each sets `tracesSampleRate: 1`, `enableLogs: true` and `sendDefaultPii: true`.
Changing only the server file leaves edge and browser traffic on the
development defaults, which is easy to miss because the server file is the one
everybody looks at.

These were **code** rather than configuration, so staging and production got the
same values — the wizard's development ones. All three now read from the
environment via `src/lib/sentry-config.ts`, with the wizard's behaviour as the
in-code default, so an environment that sets nothing behaves exactly as before.

What each one was, and what production sets:

| Setting | Wizard default | Production | Why |
|---|---|---|---|
| `tracesSampleRate` | `1` | `0.1` | 100% tracing ties Sentry quota directly to traffic. At today's volume the cost is small; the exposure is a spike burning a month's quota in a day. Sampling bounds it |
| `sendDefaultPii` | `true` | `false` | Sends IP addresses and request headers to a third-party processor. There are no user accounts, so almost nothing is gained, and it is a GDPR question worth answering deliberately rather than inheriting |
| `enableLogs` | `true` | `false` | Logs already ship to Axiom (`009-axiom-logs.md`). Leaving this on gives two destinations, two bills, and two places to search |

The browser needs its own `NEXT_PUBLIC_`-prefixed copies of all three: values
read in the browser are inlined at build time, so a server-only variable is
`undefined` there. That asymmetry is how a client keeps tracing everything while
the server behaves.

### A blank variable means "unset", not "zero"

`Number("")` is `0`, so an empty `SENTRY_TRACES_SAMPLE_RATE` — copied from
`.env.example`, or added in the dashboard without a value — would switch tracing
off entirely while looking configured. `src/lib/sentry-config.ts` parses these
rather than trusting `Number`: blank, non-numeric, and anything outside 0–1 all
fall back to the default. A flag turns off only on the exact string `false`,
because the failure worth guarding is a setting silently flipping.

### Session Replay is removed, not sampled down

The wizard enabled it at `replaysSessionSampleRate: 0.1` — one visitor in ten
recorded, plus every session in which an error occurred. On a public site with
no accounts that records real people's browsing, for a debugging benefit this
app has little use for: nearly every page is server-rendered, so a replay shows
a page load and a click.

The integration is **deleted** rather than set to zero. Zero rates stop the
recording but still ship the replay bundle to every visitor's browser; removing
it does not.

Removed by omitting the `integrations` option, not by passing `integrations: []`.
An explicit empty array *replaces* Sentry's defaults rather than removing Replay
from them, which would take the global error handlers, breadcrumbs and request
context with it — leaving the browser barely reporting anything. Replay is not a
default; it only ever appears when explicitly added. If it is ever wanted, it comes back deliberately with `maskAllText`
and `blockAllMedia` set explicitly rather than inherited.

### The wizard's example routes are deleted

`sentry-example-page` and `sentry-example-api` existed to prove the integration
once, and are now deleted. They had been reachable in production, and they
logged through `Sentry.logger` — which `LOG_LEVEL` does not govern — so they
were the one part of the app whose logging could not be turned down.

### Nothing needs clicking in Sentry

All of the above is code plus Railway variables. The Sentry project itself needs
no configuration change for this.

One optional hardening, not required: Sentry can scrub sensitive data
server-side as well (**Settings → Security & Privacy → Data Scrubbing**). With
`sendDefaultPii: false` we are not sending it in the first place, so this is
defence in depth rather than the fix.

## Step 6 — Set `LOG_LEVEL`

`src/lib/logger.ts` defaults to `info` in production and `debug` elsewhere.

**Recommended: `info`.** It is worth understanding why this is safe rather than
assuming it, because "info in production" is usually the wrong answer.

Exactly two paths log at `info` through the Pino logger, and neither scales
with user traffic:

- `src/lib/provider-request.ts`, once per *outbound provider request*. This is
  bounded by **cache misses rather than user traffic** — a busy day does not
  multiply it — but the bound lives in the service layer, not here.
  `src/lib/taso.ts` and `src/lib/football-data.ts` call the helper directly
  with no caching of their own; `standings-service.ts` and
  `taso-standings-service.ts` are what bound them, through Redis TTL caches,
  matches stored in Postgres and refreshed only when `needsRefresh` says so,
  and React `cache()` for per-request deduplication.
- `src/app/api/health/route.ts`, once per request to it. Railway probes
  `healthcheckPath` only while gating a new deployment and stops once the
  deploy is live, so this is per-deploy volume plus whatever hits it by hand.

  Note the one deliberate hole in the paragraph above: `?providers=1` calls
  `getCurrentSeason` straight from `taso.ts`, bypassing the service-layer
  cache, so each such request is a real uncached TASO call and its own info
  log. That is why it is opt-in rather than part of the default probe — but it
  does mean a scripted monitor hitting `?providers=1` on a short interval would
  turn an unbounded provider call into a per-interval one.

Everything else in `src/` logs at `warn` or `error`.

The Sentry wizard's example routes used to log at info level here too, but
through `Sentry.logger.info` rather than Pino — so `LOG_LEVEL` never governed
them, only Step 5's `enableLogs` did. They were the one part of the app whose
logging could not be turned down, and they are deleted (see Step 5).

If Axiom volume does become a cost, the lever is the provider-request log line
rather than the global level. Dropping to `warn` keeps every warning and error —
it discards the record of provider requests that *succeeded*, which is what
makes latency and volume questions answerable at all. Failures would still be
visible; the baseline to compare them against would not.

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

1. Merge something into `release` through a pull request (the 1-approval gate).
   It must touch a watched path — `src/`, `public/`, `drizzle/`, the lockfile
   or a listed config file. A documentation-only merge deploys nothing, so
   verifying with one means watching for a deploy that correctly never starts.
2. Watch the production deploy log
3. Confirm `npm run db:migrate` runs before the server starts
4. Confirm the health check passes and the deploy goes live
5. Check the response body:

```sh
# Railway's generated domain for the production service — custom domains are
# out of scope here, so this is the *.up.railway.app one from Settings → Networking.
curl -s https://<production-service>.up.railway.app/api/health | jq
```

Expect `status: "ok"`, with `checks.database` and `checks.redis` both `"ok"` —
they sit under `checks`, not at the top level. Add `?providers=1` to include a
live TASO check; it is opt-in precisely because a probe should not call a
provider on every request.

Then confirm the isolation actually holds:

- production's `DATABASE_URL` is not staging's
- production's `REDIS_URL` is not staging's
- writing to staging's database leaves production's untouched

---

## Deploy source, and what is deliberately missing

Production deploys on a push to `release` that touches a watched path — the
same `watchPatterns` qualification as Step 3. Since `release` cannot be pushed
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
2. Confirm exactly one PostgreSQL and one Redis, adding them only if the
   environment was created empty rather than duplicated (Step 2)
3. Set the trigger branch to `release` (Step 3)
4. Replace all eight manual variables — they arrive holding staging's values —
   and confirm the two database variables point at this environment's
   instances, not staging's (Step 4)
5. Apply the Sentry and log-level values recorded in Steps 5 and 6
6. Merge to `release` and verify the deploy, migrations and health check
   (Step 8)

Only deploy *behaviour* is recreated from the repo. The environment itself, the
app service, the PostgreSQL and Redis instances, the trigger branch and every
variable value are dashboard-managed prerequisites — steps 1 to 4 above cannot
be replayed from `railway.toml`, which is why they are written out rather than
pointed at. Keep the variable values somewhere recoverable; nothing in this
repository can reproduce them.

---

## Done when
- [ ] `production` environment exists, separate from staging
- [ ] It has exactly one PostgreSQL and one Redis, both this environment's own,
      and neither URL matches staging's
- [ ] Its trigger branch is `release`; a push to `main` never reaches production
- [ ] All ten variables in Step 4 are set, every one replaced rather than
      inherited from the duplicated environment, with no value shared with staging
- [ ] The auth variables are deliberately left unset
- [x] All three Sentry configs — server, edge and client — read their settings
      from the environment
- [x] Session Replay is decided **and applied in code** — the integration is
      removed, so it neither records nor ships its bundle
- [x] The wizard's example routes are deleted rather than left reachable
- [ ] The six Sentry variables are set on the production service — the code
      defaults to the wizard's behaviour, so until they are set production is
      still tracing everything and sending PII
- [ ] `LOG_LEVEL` is decided and recorded
- [ ] A deploy runs migrations before taking traffic and passes its health check
- [ ] `/api/health` in production returns `status: "ok"` with `checks.database`
      and `checks.redis` both `"ok"`

## Next
→ The release workflow — release CI, Wait for CI, version tagging and rollback.
