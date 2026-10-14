# 018 — The health check

## Goal

Confirm `/api/health` answers. Railway asks it before sending traffic to a new
deployment (`.railway/railway.ts`), and it is the quickest way to see what an
environment is running.

---

## Step 1 — Ask it

```bash
curl -s https://<staging host>/api/health
```

```json
{ "status": "ok", "checks": { "database": "ok", "redis": "ok" }, "commit": "…" }
```

`commit` is the commit that environment runs.

`?providers=1` also asks TASO whether the key still works. It is a real,
uncached provider request each time: use it by hand or from the daily
`taso-key-check.yml`, not from a monitor on a short interval.

The route is `src/app/api/health/route.ts`.

---

## Done when

- [ ] Staging answers `ok` for the database and Redis, with the commit it runs

## Next

→ `013-ci-workflow.md`
