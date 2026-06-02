# 005 — Railway setup

## Goal
Create a Railway Hobby account, connect it to the GitHub repository, and set up
the project with a PostgreSQL database and auto-deploy from main.

---

## Step 1 — Create Railway account

1. Go to https://railway.com
2. Sign up with GitHub (recommended — simplifies repo connection)
3. Upgrade to **Hobby plan** (~$5/month)
   - Go to Account → Billing → Upgrade

---

## Step 2 — Create a new project

1. In Railway dashboard → **New Project**
2. Choose **Deploy from GitHub repo**
3. Select `footy-trends`
4. Give the project a description, e.g. "Finnish-language European football trends dashboard"
5. Railway will create a project and attempt an initial deploy
   (it may fail at this point — that is fine, the app does not exist yet)
6. Click on the app service → **Settings** → **Region** → select **Europe West** (or the closest EU region available)

---

## Step 3 — Add a PostgreSQL database

Inside the Railway project:

1. Click **+ New** → **Database** → **Add PostgreSQL**
2. Railway provisions a Postgres instance with persistent storage
3. Click on the database service → **Settings** → **Region** → select the same EU region as the app

---

## Step 4 — Wire DATABASE_URL into the app service

Railway does not automatically inject the Postgres URL into the app service —
you need to create a reference variable that pulls it across:

1. Click on the **app service** → **Variables** tab
2. Click **+ New Variable**
3. Name: `DATABASE_URL`
4. Value: `${{Postgres.DATABASE_URL}}`
5. Save

Railway will resolve the reference at deploy time, keeping the actual connection
string out of your config and always in sync if the database URL ever changes.

---

## Step 5 — Configure the app service

Still on the app service:

1. **Settings** → **Source** → confirm it is pointing at your `footy-trends` repo, main branch
2. **Settings** → **Deploy** → confirm **Auto Deploy** is enabled for the main branch

> Build and start commands will be set via `railway.toml` in `019-railway-config.md`.
> Leave them blank in the dashboard for now.

---

## Step 6 — Confirm the connection

Push a small change to main and confirm Railway picks it up:

```bash
git checkout main
echo "# deploy test" >> README.md
git add README.md
git commit -m "chore: test Railway auto-deploy"
git push origin main
```

Go to Railway → your project → watch the deploy log. It should trigger within
seconds of the push.

---

## Done when
- [ ] Railway Hobby account active
- [ ] Project connected to `footy-trends` GitHub repo
- [ ] PostgreSQL database provisioned with persistent storage
- [ ] `DATABASE_URL` reference variable added to app service
- [ ] Auto-deploy enabled on main branch
- [ ] Test push triggered a deploy in Railway

## Next
→ `006-railway-verify.md`
