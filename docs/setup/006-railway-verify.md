# 006 — Verify staging

## Goal

Confirm that a push deploys, and that the database keeps its data.

---

## Step 1 — A push deploys

1. Merge any change under `src/` to `main`
2. Railway → `staging` → web service → **Deployments**: a deployment starts for
   that commit, and ends in success

A change that touches only documents deploys nothing, by design
(`.railway/railway.ts`, the watch paths).

## Step 2 — The database persists

1. Railway → `staging` → Postgres → its data view: the application's tables exist,
   created by the deploy's migrations
2. After the next deploy, they still hold their rows

## Step 3 — Usage

**Account** → **Usage**: the project is listed. Check it again after a week.

---

## Done when

- [ ] A push to `main` produced a successful deployment
- [ ] The tables exist, and survive a redeploy

## Next

→ `018-health-check.md`
