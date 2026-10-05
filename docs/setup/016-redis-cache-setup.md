# 016 — Redis

## Goal

A Redis in `staging`, in the same region as the web service. It holds the cache
of provider responses and the sign-in rate-limit counters.

---

## Step 1 — Add Redis

1. Railway → `staging` → **Create** → **Database** → **Redis**
2. Its **Settings** → **Region** → **the same region as the web service**.
   Railway does not choose it for you: this project's Redis ran in a US
   region, an ocean away from everything that reads it, until it was moved
   (`docs/infrastructure.md`)
3. Web service → **Variables** → `REDIS_URL` = `${{Redis.REDIS_URL}}`

Locally, `./scripts/setup` starts Redis with Postgres (012).

| | File |
|---|---|
| The client | `src/lib/redis.ts` |
| The cache every provider call goes through | `src/lib/cache.ts` |
| Why rate limits are stored the way they are | `decisions/318-rate-limit-storage.md` |

---

## Done when

- [ ] Redis exists in `staging`, in the web service's region
- [ ] `REDIS_URL` references it

## Next

→ `007-football-data-api.md`
