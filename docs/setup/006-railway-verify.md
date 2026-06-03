# 006 — Railway verification

## Goal
Confirm that auto-deploy works correctly and that the PostgreSQL database
persists data across deploys — no 30-day wipe, no data loss between coding sessions.

---

## Step 1 — Verify auto-deploy is wired up

After the test push from `005-railway-setup.md`:

1. Go to Railway → project → app service → **Deployments** tab
2. Confirm the latest deployment was triggered by your commit
3. Check the deploy log — it should complete without errors
   (a failed build is fine at this stage, but the trigger itself should fire)

---

## Step 2 — Verify database persistence

Railway PostgreSQL volumes persist indefinitely on the Hobby plan — there is no
automatic wipe. To confirm this is working correctly:

1. Go to Railway → project → PostgreSQL service
2. Click **Connect** → open the **Query** tab (Railway has a built-in SQL editor)
3. Run:
```sql
CREATE TABLE IF NOT EXISTS persistence_test (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  note TEXT
);

INSERT INTO persistence_test (note) VALUES ('setup verification');

SELECT * FROM persistence_test;
```
4. You should see one row returned
5. Return to this table the next day or after a re-deploy — the row should still be there

---

## Step 3 — Verify environment variables are available

In the Railway app service → Variables tab, confirm:

- [ ] `DATABASE_URL` is present (added as a reference variable to Postgres)
- [ ] Any other variables you have added are listed

To confirm they reach the app at runtime, you can temporarily add a health check
endpoint once the app exists that returns the DB connection status.

---

## Step 4 — Check Railway usage

Railway charges based on resource usage within the $5/month credit:

1. Go to Account → Usage
2. Confirm the project is listed
3. At idle (no traffic), a small app + Postgres should consume well under $5/month

---

## Done when
- [ ] Auto-deploy triggered correctly from a GitHub push
- [ ] PostgreSQL persistence confirmed via query
- [ ] `DATABASE_URL` visible in app service variables
- [ ] Usage dashboard accessible and showing expected low consumption

## Next
→ `007-football-data-api.md`