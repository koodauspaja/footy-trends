# 009 — Axiom log drain

## Goal
Connect Railway's log drain to Axiom so all application logs are shipped
automatically, searchable, and retained beyond Railway's short rolling window.
No SDK or code changes needed — Railway does the shipping.

---

## Step 1 — Create an Axiom account

1. Go to https://axiom.co
2. Sign up — free tier includes 25 GB/month ingest and 90-day retention,
   which is more than enough for a hobby project
3. No credit card needed for the free tier

---

## Step 2 — Create a dataset

Axiom organises logs into datasets. Create one for this project:

1. In Axiom → **Datasets** → **New dataset**
2. Name: `footy-trends`
3. Leave other settings as default
4. Save

---

## Step 3 — Create an API token

Railway needs an Axiom token with ingest permissions to ship logs:

1. In Axiom → **Settings** → **API tokens**
2. Click **New API token**
3. Name: `railway-log-drain`
4. Permissions: **Ingest** only (do not grant query or admin access)
5. Save and copy the token — you will only see it once, so store it in your
   password manager

---

## Step 4 — Add the log drain in Railway

1. Go to https://railway.com → your `footy-trends` project
2. Click on the app service → **Settings** → **Log Drain**
3. Click **Add log drain**
4. Choose **HTTP** as the drain type
5. Set the endpoint URL to:
   ```
   https://api.axiom.co/v1/datasets/footy-trends/ingest
   ```
6. Add a custom header for authentication:
   - Header name: `Authorization`
   - Header value: `Bearer YOUR_AXIOM_TOKEN`
7. Save — Railway will start shipping logs immediately on the next deploy

> Railway also supports log drains at the **project level** (all services) or
> per service. For now, adding it to the app service is sufficient. You can
> add a second drain for the PostgreSQL service later if you need DB logs.

---

## Step 5 — Verify logs are arriving

Trigger some log output so there is something to check:

```bash
git checkout main
echo "// axiom test" >> README.md
git add README.md
git commit -m "chore: test Axiom log drain"
git push origin main
```

1. Wait for the Railway deploy to complete
2. Go to Axiom → **Datasets** → `footy-trends` → **Query**
3. Run a basic query to confirm data is arriving:
   ```
   ['footy-trends']
   | limit 20
   ```
4. You should see Railway deploy and runtime log lines

---

## Step 6 — Create a basic dashboard (optional but recommended)

Axiom has a simple dashboard builder. A useful starting set of panels:

| Panel | Query |
|-------|-------|
| Log volume over time | `['footy-trends'] \| summarize count() by bin_auto(_time)` |
| Error rate | `['footy-trends'] \| where level == "error" \| summarize count() by bin_auto(_time)` |
| Latest logs | `['footy-trends'] \| limit 50` |

Save it as `footy-trends overview` — gives you a quick health check at a glance.

---

## Done when
- [ ] Axiom account created with `footy-trends` dataset
- [ ] API token created with ingest-only permissions
- [ ] Log drain configured in Railway pointing at Axiom
- [ ] Logs confirmed arriving in Axiom after a test push

## Next
→ `010-renovate-setup.md`