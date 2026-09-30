# 024 — The hourly predictions run

## Goal

A Railway cron service that runs `npm run predictions -- log` hourly in
**production only**, and a one-off backtest per environment. See
`specs/052-predictions-log.md` (S1, S10–S12).

Set up in the dashboard: Railway no longer lets a new service use
`railway.toml` (config as code is deprecated, hard cutoff 2026-12-01).

---

## Step 1 — Create the service

1. Railway → project → environment **production** → **Create** → **GitHub Repo** → this repository
2. Name it `predictions`
3. Settings → Source → branch `release`

## Step 2 — Settings

| Setting | Value |
|---|---|
| Deploy → Custom Start Command | `npm run predictions -- log` |
| Deploy → Cron Schedule | `0 * * * *` (UTC) |
| Deploy → Restart Policy | Never |
| Deploy → Healthcheck Path | empty |
| Deploy → Pre-deploy Command | empty — the web service runs the migrations |
| Networking | no public domain |

## Step 3 — Variables

Reference the web service's values, do not copy them:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `FOOTBALL_DATA_API_KEY` | as the web service |
| `TASO_API_KEY` | as the web service |
| `FOOTBALL_DATA_EARLIEST_SEASON` | as the web service |
| `AXIOM_DATASET`, `AXIOM_TOKEN` | as the web service |
| `NODE_ENV` | `production` |

## Step 4 — Backtest, once per environment

After the release carrying the `predictions` table has deployed:

```bash
DATABASE_URL=<environment's public URL> npm run predictions -- backtest
```

Stored rows only; no provider request. Run again whenever a model is added.

## Step 5 — Staging, by hand

No cron service in staging: the football-data key is shared with production
(docs/setup/021). To try the run there:

```bash
DATABASE_URL=<staging public URL> npm run predictions -- log
```

## Step 6 — After a week

Railway → project → Usage → the `predictions` service. Record the week's cost
on #349 against the spec's estimate (about $0.11 a month).

## Done when

- [ ] `predictions` exists in production only, with the settings above
- [ ] A run shows in its Deployments tab each hour, exiting 0
- [ ] The backtest has run in staging and production
- [ ] The first week's usage is recorded on #349
