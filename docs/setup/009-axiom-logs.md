# 009 — Axiom log setup

## Goal
Create an Axiom account and dataset so the app can ship logs there via the
Axiom Next.js SDK. Railway does not have a native log drain — logs are sent
directly from the application instead.

---

## Step 1 — Create an Axiom account

1. Go to https://axiom.co
2. Sign up — free tier includes 25 GB/month ingest and 90-day retention,
   which is more than enough for a hobby project
3. No credit card needed for the free tier

---

## Step 2 — Create or reuse a dataset

If you already have an Axiom account with existing datasets, you can reuse one
and filter by service name in queries. If you want a clean separation, create
a new dataset:

1. In Axiom → **Datasets** → **New dataset**
2. Name: `footy-trends` (or add to an existing dataset and filter later)
3. Leave other settings as default
4. Save

---

## Step 3 — Create an API token

1. In Axiom → **Settings** → **API tokens**
2. Click **New API token**
3. Name: `footy-trends-ingest`
4. Permissions: **Ingest** only (do not grant query or admin access)
5. Save and copy the token — you will only see it once, so store it in your
   password manager

---

## Step 4 — Store the token in Railway

1. Go to Railway → project → app service → **Variables** tab
2. Add:

| Name | Value |
|------|-------|
| `AXIOM_TOKEN` | your API token from Step 3 |
| `AXIOM_DATASET` | `footy-trends` (or your dataset name) |

---

## Step 5 — Add to .env.example

```
# Axiom logging (SDK added during project init)
AXIOM_TOKEN=
AXIOM_DATASET=footy-trends
```

```bash
git add docs/setup/009-axiom-logs.md .env.example
git commit -m "chore: add Axiom env vars to .env.example"
git push origin main
```

---

## Step 6 — SDK integration (deferred to project init)

The actual SDK (`@axiomhq/nextjs`) is installed and wired up in
`012-project-init.md` alongside the rest of the application setup.
The credentials stored above will be ready when that step runs.

For reference, the integration is a few lines in `next.config.ts` —
no custom logging calls needed in application code.

---

## Done when
- [ ] Axiom account and dataset ready
- [ ] API token created with ingest-only permissions
- [ ] `AXIOM_TOKEN` and `AXIOM_DATASET` stored in Railway variables
- [ ] Both added to `.env.example`

## Next
→ `010-renovate-setup.md`
