# 026 — A new Railway environment from code

## Goal

One command that builds an environment from nothing: its own Postgres and
Redis, the web service, its variables, and a first deploy that answers
`/api/health`. For a first environment in a new project, or a short-lived one
for a branch. Why it is built this way, and what keeps it away from an
environment that exists: `decisions/522-railway-environment-from-code.md`.

It creates an environment in a project that exists, and only builds into one
that **holds nothing**: a new project's own empty `production` qualifies. Its
databases are named after it, `Postgres-<name>` and `Redis-<name>`. It replaces the
dashboard steps of 005, 016 and 021 for that environment; the manual steps
below remain.

---

## Step 1 — The keys

Have these before the first run:

| Name | Required | From |
|---|---|---|
| `FOOTBALL_DATA_API_KEY` | yes | 007 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | 014: the Testing project's client, unless this is production |
| `AUTH_ALLOWED_EMAILS` | yes, except for an environment named `production` | who may sign in, comma-separated |
| `TASO_API_KEY` | no | 020 |
| `AXIOM_TOKEN`, `AXIOM_DATASET` | no; the workflow does not pass them | 009 |
| `NEXT_PUBLIC_SENTRY_DSN` | no; the workflow does not pass it | 017 |

One left out is set in Railway afterwards. The command sets `DATABASE_URL`,
`REDIS_URL`, `BETTER_AUTH_URL` and a new `BETTER_AUTH_SECRET` itself.

## Step 2 — Run it, from your machine

```bash
railway init            # once, in a new organisation: an empty project
railway link            # your project, any environment
FOOTBALL_DATA_API_KEY=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
  AUTH_ALLOWED_EMAILS=… npm run railway:environment -- --name=staging
```

`--branch=<branch>` chooses what a new name deploys from, `main` by default;
`staging` and `production` have their own. The directory is left linked to the
new environment.

## Step 3 — Or run it from GitHub

Once, in the repository's settings:

1. **Environments** → **New environment** → `railway-provisioning`. Add
   **Required reviewers**, and limit deployment branches to the default branch.
2. In that environment, the secret `RAILWAY_API_TOKEN`: a Railway **workspace**
   token (Railway → Account Settings → Tokens, with your workspace chosen). It
   can change every project in the workspace, which is why it lives behind the
   reviewers and not among the repository's secrets.
3. In that environment, the secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   and `AUTH_ALLOWED_EMAILS`. The two provider keys are repository secrets
   already (013).
4. The repository variable `RAILWAY_PROJECT_ID` (`railway status --json`, `id`).

Then **Actions** → **Railway environment** → **Run workflow**, with a name and
a branch. A reviewer approves the run before it starts.

## Step 4 — What remains by hand

- **Google:** add `https://<the new site>/api/auth/callback/google` to the
  client's redirect URIs (014). Sign-in fails there until it is.
- **Axiom, Sentry:** a dataset and token (009) and a DSN (017) of the
  environment's own, set as variables of its web service in Railway. Until
  then it logs to Railway's log and reports no errors.
- **Region:** `.railway/databases.ts` names this project's region in `REGION`.
  Change it for yours before the first run.
- **Sleeping when idle:** the three dashboard settings in
  `docs/infrastructure.md`, *Staging sleeps*, if the environment should.
- **An admin:** 023.

## Later

- **A plan or apply of an environment other than `staging` or `production`**
  needs its branch again:
  `RAILWAY_NEW_ENVIRONMENT_BRANCH=<branch> railway config plan`.
- **Rotating a key** is two places: the GitHub secret, which only new
  environments read, and the variable in each Railway environment that holds
  it.
- **A run that failed part-way** leaves an environment that holds something,
  and the next run refuses it. Delete the environment and run again.
- **Removing one:** `railway environment delete <name>`. Its databases and
  their data go with it.

---

## Done when

- [ ] The command ended with `… reports the database and Redis ok.`
- [ ] `railway config plan` reports no changes in the new environment
- [ ] Sign-in works there with an address on the list

## Next

→ Nothing: the setup is complete. `docs/infrastructure.md` describes what now
  exists, and is the document to keep true from here on. `skills/release.md` is
  how `main` reaches production.
