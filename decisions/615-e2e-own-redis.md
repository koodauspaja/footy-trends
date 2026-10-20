# 615 — The e2e suite's own Redis: decisions

Chore #615. e2e specs seed rows behind cached reads and drop the cache entries
that would hide them. Without the TASO stand-in they did so in development's
Redis, and each spec opened its own client to do it.

| Decision | Choice | Why |
|---|---|---|
| A live run's Redis | Database 1 on the server `REDIS_URL` names, `liveRunRedisUrl`; a `REDIS_URL` naming database 1 itself, by path or `db` option, stops the run | Miikka, 2026-10-20: "A logical DB of REDIS_URL". The stand-in run keeps its container (decisions/674). Overrides decisions/672's paragraph that the suite's Redis is the one `npm run dev` uses, for live runs as decisions/674 did for stand-in runs |
| Where a run's Redis comes from | `e2eRedisUrl(env)`, one function for the server's `REDIS_URL` in `playwright.config.ts` and for the specs; the run no longer overwrites `REDIS_URL` | Derived, as global setup derives the stand-in's, so no inherited variable can point a spec at development's Redis |
| The specs' deletes | `dropCached(...)` in `tests/support/e2e-redis.ts`: a key, or a pattern with `*`; the five specs that opened a client of their own use it | One place connects, so the refusal above covers every delete |
| `prediction-quality` | Drops `quality:v3:taso:*` after the cleanup too, not only after the seed | A report made with the seeded match would otherwise outlive it by 15 minutes |
| The key names | Written out in each spec, as before; not imported from `src/` | The specs import no application module. A renamed key stops matching, the stale entry stays, and the spec that depends on it fails rather than passing on a stale read |
| The recorder | `npm run test:e2e:record-taso` reads category names from the live run's database | It records what live runs stored, and they now cache there |
| Other seeding specs | `surprise` seeds rows the page reads without a cache; no other spec seeds | Searched `tests/e2e` for inserts |
