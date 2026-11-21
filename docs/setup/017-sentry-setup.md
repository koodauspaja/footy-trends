# 017 — Sentry

## Goal

Runtime errors from each environment in Sentry, with readable stack traces.
The integration arrives with the clone; this step creates the Sentry project,
gives the app its DSN, and gives the build a token to upload source maps.

---

## Step 1 — A Sentry project per environment

1. https://sentry.io → sign up (the free tier is enough)
2. **Create project** → **Next.js**, one for staging and one for production
3. Copy each project's **DSN** and its **slug**
4. **Settings** → **Organization Tokens** → **Create New Token**, one per
   environment, named after it. Its scope is fixed, `org:ci`: creating releases
   and uploading source maps, nothing else. Its value is shown once

Do not run the Sentry wizard: it would regenerate files the repository already
has, with development defaults.

## Step 2 — Store the DSN and the upload's settings

Web service → **Variables**, in `staging`:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | staging's DSN |
| `SENTRY_PROJECT` | staging's project slug |
| `SENTRY_AUTH_TOKEN` | staging's organisation token |

Locally, leave the DSN empty unless you are testing Sentry itself, and set
neither of the other two: only Railway's builds upload (decisions/830).

Staging sets nothing else, so it traces a tenth of requests, the in-code
default. What an event may carry is not a variable: `DATA_COLLECTION` in
`src/lib/platform/sentry-config.ts`, the same everywhere, and no log is sent to Sentry
(`021-production-environment.md`, Step 5).

## Step 3 — Verify, after the first deploy

```bash
NEXT_PUBLIC_SENTRY_DSN='<staging DSN>' npm run verify:sentry
```

It sends one marked event and prints the marker to search for in Sentry →
**Issues** (`021-production-environment.md`, *Verifying Sentry actually receives
events*, explains its output).

The deploy's build log shows the upload under `[@sentry/nextjs`; a line saying
`No auth token provided` means `SENTRY_AUTH_TOKEN` did not reach the build.

| | File |
|---|---|
| The three runtimes' configuration | `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts` |
| What they read from the environment | `src/lib/platform/sentry-config.ts` |
| A warning silenced on purpose | `decisions/174-max-listeners-warning.md` |

---

## Done when

- [ ] A Sentry project exists for staging
- [ ] `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` are set in Railway `staging`
- [ ] A test error from staging appears in Sentry
- [ ] Staging's build log shows source maps uploaded

## Next

→ `025-railway-infrastructure-as-code.md`
