# 007 — football-data.org API key

## Goal
Register for a football-data.org free tier account, obtain the API key, and
store it securely as a Railway environment variable.

---

## Step 1 — Register

1. Go to https://www.football-data.org/client/register
2. Fill in the form — free tier, no credit card needed
3. Check your email and confirm the account
4. Log in and go to your profile — your API key is shown there
5. Copy the key somewhere safe temporarily (password manager recommended)

---

## Step 2 — Understand the free tier limits

| Limit | Value |
|-------|-------|
| Requests per minute | 10 |
| Competitions included | Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, and others |
| Historical data | Limited — current season + some history |
| Response caching required | Yes — always cache responses locally |

**Important:** The spec for any feature that calls the API must explicitly state
that responses are cached. Claude Code should implement caching from day one —
this must also be in `REVIEW_RULES.md` (already added in `004-sourcery-setup.md`).

---

## Step 3 — Store the API key in Railway

Never commit the API key to the repository. Store it as an environment variable in Railway:

1. Go to Railway → project → app service → **Variables** tab
2. Click **+ New Variable**
3. Name: `FOOTBALL_DATA_API_KEY`
4. Value: paste your API key
5. Save — Railway will redeploy automatically

The app will access it in code as:
```typescript
const apiKey = process.env.FOOTBALL_DATA_API_KEY;
```

---

## Step 4 — Store the key locally for development

For local development, create a `.env` file in the repo root:

```
FOOTBALL_DATA_API_KEY=your_key_here
DATABASE_URL=your_local_or_railway_db_url
```

Confirm `.env` is in `.gitignore` — it should be if you used the Node template.

```bash
grep ".env" .gitignore
# Should output: .env
```

---

## Step 5 — Create `.env.example`

Commit a template file with every variable name but no real values.
This tells future collaborators (and Claude Code) exactly what needs setting up locally.

Create file: `.env.example` in the repo root.

```
# Football data API
FOOTBALL_DATA_API_KEY=

# Database — Railway injects DATABASE_URL automatically in production
DATABASE_URL=postgresql://user:password@localhost:5432/footy-trends

# Redis — Railway injects REDIS_URL automatically in production (added in 016)
REDIS_URL=redis://localhost:6379

# Google OAuth (added in 014)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Sentry (added in 017)
NEXT_PUBLIC_SENTRY_DSN=
```

```bash
git add .env.example
git commit -m "chore: add .env.example"
git push origin main
```

> Each subsequent setup step (014, 016, 017) adds to this list. Update `.env.example`
> in the same commit as the Railway variables step for that doc.

---

## Step 6 — Test the API key

Quick test to confirm the key works — run this in your terminal:

```bash
curl "https://api.football-data.org/v4/competitions" \
  -H "X-Auth-Token: YOUR_API_KEY_HERE"
```

You should receive a JSON response listing available competitions. Confirm
Champions League (CL) and the top 5 leagues are in the list.

---

## Done when
- [ ] football-data.org account created and API key obtained
- [ ] API key stored as `FOOTBALL_DATA_API_KEY` in Railway variables
- [ ] `.env` file created locally and confirmed in `.gitignore`
- [ ] `.env.example` committed with all variable names and no real values
- [ ] API key tested and returning valid competition data

## Next
→ `008-sonarqube-setup.md`