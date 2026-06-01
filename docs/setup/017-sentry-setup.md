# 017 — Sentry error monitoring

## Goal
Wire Sentry into the Next.js app so runtime exceptions in production are
captured with full stack traces. Axiom handles logs — Sentry handles crashes.

---

## Step 1 — Create a Sentry account and project

1. Go to https://sentry.io and sign up (free tier is sufficient)
2. Create a new project → choose **Next.js**
3. Note the **DSN** shown during setup — you will need it in Step 3

---

## Step 2 — Run the Sentry wizard

The wizard creates all required config files automatically:

```bash
npx @sentry/wizard@latest -i nextjs
```

Accept all defaults. The wizard creates:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- Updates `next.config.ts` with the Sentry plugin

Commit everything the wizard generates:

```bash
git add .
git commit -m "chore: add Sentry error monitoring"
```

---

## Step 3 — Store the DSN

Never hardcode the DSN. Store it as an environment variable.

In Railway → app service → **Variables** tab, add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | your DSN from Step 1 |

Add to local `.env`:

```
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

Update `.env.example`:

```
NEXT_PUBLIC_SENTRY_DSN=
```

---

## Step 4 — Confirm the wizard used the env var

Open `sentry.client.config.ts` and confirm the `dsn` field reads from the
environment variable rather than being hardcoded:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
```

If the wizard hardcoded the DSN, replace it with `process.env.NEXT_PUBLIC_SENTRY_DSN`.
Apply the same check to `sentry.server.config.ts` and `sentry.edge.config.ts`.

A low `tracesSampleRate` (0.1 = 10%) keeps you within the free tier on a hobby
project while still giving useful performance data.

---

## Step 5 — Verify

Push to main and trigger a Railway deploy. Then go to Sentry → your project
→ **Issues** — it should show a "This is your first event" entry from the
wizard's test event, confirming the integration is working.

---

## Done when
- [ ] Sentry project created
- [ ] Wizard run and config files committed
- [ ] `NEXT_PUBLIC_SENTRY_DSN` in Railway variables and local `.env`
- [ ] DSN not hardcoded in any config file
- [ ] Test event visible in Sentry dashboard

## Next
→ `018-health-check.md`