# 017 — Sentry

## Goal

Runtime errors from each environment in Sentry. The integration arrives with
the clone; this step creates the Sentry project and gives the app its DSN.

---

## Step 1 — A Sentry project per environment

1. https://sentry.io → sign up (the free tier is enough)
2. **Create project** → **Next.js**, one for staging and one for production
3. Copy each project's **DSN**

Do not run the Sentry wizard: it would regenerate files the repository already
has, with development defaults.

## Step 2 — Store the DSN

Web service → **Variables**, in `staging`:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | staging's DSN |

Locally, leave it empty unless you are testing Sentry itself.

Staging sets nothing else, so it traces everything and sends logs to Sentry
too. Production turns those down: `021-production-environment.md`, Step 5.

## Step 3 — Verify, after the first deploy

```bash
NEXT_PUBLIC_SENTRY_DSN='<staging DSN>' npm run verify:sentry
```

It sends one marked event and prints the marker to search for in Sentry →
**Issues** (`021-production-environment.md`, *Verifying Sentry actually receives
events*, explains its output).

| | File |
|---|---|
| The three runtimes' configuration | `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts` |
| What they read from the environment | `src/lib/sentry-config.ts` |
| A warning silenced on purpose | `decisions/174-max-listeners-warning.md` |

---

## Done when

- [ ] A Sentry project exists for staging
- [ ] `NEXT_PUBLIC_SENTRY_DSN` is set in Railway `staging`
- [ ] A test error from staging appears in Sentry

## Next

→ `025-railway-infrastructure-as-code.md`
