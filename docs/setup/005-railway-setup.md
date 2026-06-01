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
4. Railway will create a project and attempt an initial deploy
   (it may fail at this point — that is fine, the app does not exist yet)

---

## Step 3 — Add a PostgreSQL database

Inside the Railway project:

1. Click **+ New** → **Database** → **Add PostgreSQL**
2. Railway provisions a Postgres instance with persistent storage
3. Click on the database service → **Variables** tab
4. Note the `DATABASE_URL` — Railway injects this automatically into your app
   as an environment variable. You do not need to copy it manually.

---

## Step 4 — Configure the app service

Click on the app service (the one connected to GitHub):

1. **Settings** → **Source** → confirm it is pointing at your `footy-trends` repo, main branch
2. **Settings** → **Deploy** → confirm **Auto Deploy** is enabled for the main branch
3. **Variables** tab → add environment variables (see `007-football-data-api.md` for the API key)

### Build and start commands
Railway will try to detect these automatically for a TypeScript/Node project.
If it does not, set them manually:

```
Build command:   npm run build
Start command:   npm start
```

These can be updated later once the app has a proper build setup.

---

## Step 5 — Confirm the connection

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
- [ ] Auto-deploy enabled on main branch
- [ ] Test push triggered a deploy in Railway

## Next
→ `006-railway-verify.md`