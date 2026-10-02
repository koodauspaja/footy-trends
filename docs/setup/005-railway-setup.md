# 005 — Railway: the project, staging and Postgres

## Goal

A Railway project whose `staging` environment deploys the web service from
`main` and has its own Postgres. Production comes later, in 021.

This project: Railway project `footy-trends`, web service `footy-trends`.

---

## Step 1 — Account

1. https://railway.com → sign up with GitHub
2. **Account** → **Billing** → the Hobby plan

## Step 2 — Create the project

1. **New Project** → **Deploy from GitHub repo** → your repository
2. The first deploy may fail: no variables are set yet. That is expected

## Step 3 — Make the first environment `staging`

Railway creates every project with one environment, named `production`. Here
the first environment is `staging`, and `production` is created from it in 021.

1. Environment dropdown → **New Environment** → **Duplicate Environment**,
   from `production`, named `staging`
2. Delete the original `production` (**Settings** → **Environments**)
3. Do everything below, and in the steps that follow, in `staging`

## Step 4 — Region and source of the web service

1. Web service → **Settings** → **Region** → an EU region. This project:
   `europe-west4`
2. **Settings** → **Source** → your repository, branch `main`
3. **Settings** → **Networking** → **Generate Domain**. This host is the
   environment's URL; 014 needs it for the sign-in callback

Build and start commands stay blank: `.railway/railway.ts` sets them (025).

## Step 5 — Postgres

1. **Create** → **Database** → **PostgreSQL**
2. Its **Settings** → **Region** → the same region as the web service
3. Web service → **Variables** → `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`

---

## Done when

- [ ] The project has one environment, `staging`
- [ ] The web service deploys from `main`, in an EU region, and has a public domain
- [ ] Postgres is in the same region, and `DATABASE_URL` references it

## Next

→ `016-redis-cache-setup.md`
