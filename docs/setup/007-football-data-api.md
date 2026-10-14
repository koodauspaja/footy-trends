# 007 — The football-data.org API key

## Goal

A football-data.org key, in Railway and in your local `.env`. It serves
`Ulkomaat` and the international tournaments.

---

## Step 1 — Register

1. https://www.football-data.org/client/register (the free tier needs no card)
2. Confirm the email; the key is on your profile page

The free tier allows **10 requests a minute per key**. The app caches every
response for that reason (REVIEW_RULES.md), and the same key serves staging,
production, local end-to-end runs and the backfill
(`docs/infrastructure.md`, Data providers).

## Step 2 — Store it in Railway

Web service → **Variables**, in `staging`:

| Name | Value |
|---|---|
| `FOOTBALL_DATA_API_KEY` | the key |
| `FOOTBALL_DATA_EARLIEST_SEASON` | `2023`: the earliest season your plan serves |
| `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` | `3600`: how old stored matches may be before a refresh |

## Step 3 — Store it locally

Add the key to `.env`. `.env.example` lists every variable the app reads, with
no real value; `./scripts/setup` creates `.env` from it.

## Step 4 — Test the key

```bash
curl -H "X-Auth-Token: <your key>" https://api.football-data.org/v4/competitions
```

A JSON list of competitions means the key works.

---

## Done when

- [ ] The three variables are set in Railway `staging`
- [ ] The key is in your local `.env`, which is not committed
- [ ] The test request answers with competitions

## Next

→ `020-taso-api-key.md`
