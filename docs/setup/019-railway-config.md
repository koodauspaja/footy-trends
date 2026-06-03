# 019 — Railway config as code

## Goal
Replace manually configured Railway settings with a `railway.toml` file committed
to the repo. This makes build commands, start commands, health checks, and deploy
behaviour version-controlled and reproducible — no more clicking through the
Railway dashboard to check what the current settings are.

Complete this step after `018-health-check.md`. By that point the app is
running, migrations work, and the health check endpoint exists — so the config
file can be written with confidence.

---

## What goes in `railway.toml`

| Setting | Value | Replaces |
|---------|-------|---------|
| `build.watchPatterns` | `src/**`, `public/**` etc. | Triggers deploy only on app code changes |
| `deploy.preDeployCommand` | `npm run db:migrate` | Manual start command hack from `015` |
| `deploy.startCommand` | `npm start` | Dashboard start command |
| `deploy.healthcheckPath` | `/api/health` | Dashboard health check path from `018` |
| `deploy.healthcheckTimeout` | `60` | Dashboard health check timeout |
| `deploy.restartPolicyType` | `ON_FAILURE` | Dashboard restart policy |

---

## Step 1 — Create `railway.toml`

Create file: `railway.toml` in the repo root.

```toml
[build]
# Only trigger a deploy when application code or config changes.
# Pushes that touch only docs, specs, decisions, or tests do not redeploy.
watchPatterns = [
  "src/**",
  "public/**",
  "drizzle/**",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "railway.toml"
]

[deploy]
# Run migrations before the new container takes traffic.
# Railway runs this command inside the new container before health checks pass.
preDeployCommand = "npm run db:migrate"

# Start the Next.js server.
startCommand = "npm start"

# Health check — Railway will not route traffic until this returns 200.
healthcheckPath = "/api/health"
healthcheckTimeout = 60

# Restart automatically if the process crashes.
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

# Zero-downtime deploys:
# keep the old container alive for 15 seconds after the new one is healthy,
# then drain connections for 10 seconds before killing it.
overlapSeconds = 15
drainingSeconds = 10
```

---

## Step 2 — Remove the manual start command from Railway

Now that `startCommand` and `preDeployCommand` are in the file, clear the
manually set start command in the Railway dashboard so there is no conflict:

1. Go to Railway → project → app service → **Settings** → **Deploy**
2. Clear the **Start command** field (leave it blank — Railway will use the file)
3. Clear the **Pre-deploy command** field if you set one in `015`
4. Save

Railway docs: config file values always override dashboard values, but removing
the dashboard value keeps things unambiguous.

---

## Step 3 — Update the health check path in Railway

The health check path is now in `railway.toml`, but Railway may still have the
old dashboard value. Clear it the same way:

1. Railway → project → app service → **Settings** → **Deploy**
2. Clear the **Health check path** field
3. Save

---

## Step 4 — Commit and verify

```bash
git add railway.toml
git commit -m "chore: add Railway config as code"
git push origin main
```

1. Go to Railway → project → watch the deploy log
2. Confirm the pre-deploy command (`npm run db:migrate`) runs before start
3. Confirm the health check passes and the deploy completes successfully
4. Go to the deployment details page → hover the file icon next to any setting
   to confirm it is coming from `railway.toml` and not the dashboard

---

## Watch patterns — what not to include

Pushes to the following should **not** trigger a Railway redeploy. They are
excluded by not listing them in `watchPatterns`:

- `docs/**` — setup guides and reference material
- `specs/**` — feature specs
- `decisions/**` — ADRs
- `*.md` — markdown files at the repo root
- `.github/**` — CI workflow changes
- `tests/**` — test-only changes (CI runs tests; Railway does not need to redeploy)

If a test change also touches `src/`, Railway will still deploy because `src/**`
is watched — this is the correct behaviour.

---

## Done when
- [ ] `railway.toml` committed to repo root
- [ ] Dashboard start command and pre-deploy command cleared
- [ ] Dashboard health check path cleared
- [ ] Deploy confirms pre-deploy migration runs before start
- [ ] Deployment details page shows settings sourced from `railway.toml`

## Next
→ `011-branch-protection.md`
