# 009 — Axiom logs

## Goal

The app's logs in Axiom. Railway has no log drain: the app ships its own logs,
through Pino's Axiom transport (`src/lib/logger.ts`), when a token is set.

This project: datasets `footy-trends` (staging) and `footy-trends-prod`
(production).

---

## Step 1 — Account and dataset

1. https://axiom.co → sign up (the free tier is enough)
2. **Datasets** → **New dataset**, one per environment

## Step 2 — An ingest token

**Settings** → **API tokens** → **New API token**, with **Ingest** permission
for that dataset only. It is shown once.

## Step 3 — Store it in Railway

Web service → **Variables**, in `staging`:

| Name | Value |
|---|---|
| `AXIOM_TOKEN` | the token |
| `AXIOM_DATASET` | the dataset's name |
| `LOG_LEVEL` | `info` |

Locally, leave `AXIOM_TOKEN` empty: the app logs to the terminal.

## Step 4 — Verify, after the first deploy

Open the dataset: a line appears for each request the app makes to a provider.

---

## Done when

- [ ] A dataset and an ingest-only token exist for staging
- [ ] `AXIOM_TOKEN`, `AXIOM_DATASET` and `LOG_LEVEL` are set in Railway `staging`
- [ ] Log lines arrive in the dataset after a deploy

## Next

→ `017-sentry-setup.md`
