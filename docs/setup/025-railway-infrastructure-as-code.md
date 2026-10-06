# 025 — Apply `.railway/railway.ts`

## Goal

The web service's build and deploy settings applied to `staging` from
`.railway/railway.ts`: migrations before traffic, the start command, the health
check, restart retries, the handover times and the watch paths. Why each is
what it is: the file's own comments.

**Railway never reads `.railway/` during a deploy.** A change takes effect only
when applied, once per environment.

---

## Step 1 — Make the file yours

`.railway/railway.ts` names this project. Change, and change the same values
in `tests/unit/railway-config.test.ts`:

| In the file | This project |
|---|---|
| `partial`, and the service's name | `footy-trends` |
| The repository | `koodauspaja/footy-trends` |

## Step 2 — The CLI

```bash
brew install railway    # the CLI; tested with 5.62.1
railway login
```

The CLI is separate from the npm `railway` dev dependency: that package is the
SDK the CLI evaluates `.railway/railway.ts` against, and it has no
`railway config plan` of its own.

## Step 3 — Every listed variable exists

An apply removes any variable the file does not list, and the file lists every
variable the service holds. Before the first apply, confirm that each name in
the file's `SHARED_VARIABLES` and in `staging`'s entry exists in Railway
`staging` (005, 016, 007, 020, 014, 009 and 017 set them).

## Step 4 — Plan

```bash
railway link            # your project, environment staging, the web service
railway config plan
```

Read the plan before applying. Stop if it:

- deletes or creates anything, a variable included
  (except as listed for a production created from staging: 021 Step 7)
- changes the service's source, repository, branch or `checkSuites`
  (the same exception: 021 Step 7 expects `checkSuites` to turn on)
- touches Postgres, Redis or any other service

On a new environment the expected changes are the build and deploy settings,
each from empty to the file's value.

## Step 5 — Apply

```bash
railway config apply
```

Then redeploy and read the deploy log:

- the pre-deploy step ran `npm run db:migrate`
- the health check on `/api/health` passed

`railway config plan` now reports that the configuration is up to date.

Production is applied from `021-production-environment.md`, Step 7.

## Later — a change to the file, or a new variable

- Merging a change to `.railway/railway.ts` does not apply it. Plan and apply
  again, in each environment.
- A variable added in the dashboard is added to the file first (`preserve()`,
  no value), or the next apply deletes it.

---

## Done when

- [ ] `railway config plan` reports no changes in `staging`
- [ ] A staging deploy ran the migrations and passed the health check
- [ ] A docs-only push to `main` deployed nothing

## Next

→ `006-railway-verify.md`
