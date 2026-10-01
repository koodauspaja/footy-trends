# 025 — Railway configuration as Infrastructure as Code

## Goal

The web service's build and deploy settings come from `.railway/railway.ts`,
applied to each environment. It replaces `railway.toml` (019), which Railway
stops reading on 2026-12-01. Why each setting is what it is: the file's own
comments.

Railway never reads `.railway/` during a deploy. A change takes effect only
when applied, once per environment.

**Apply both environments before the change deleting `railway.toml` merges.**
Until then the file is what supplies the migrations and the health check; a
deploy with neither applied would run without them. Apply from that branch's
checkout: the CLI reads the local file.

---

## Step 1 — The CLI

```bash
brew install railway    # the CLI; tested with 5.62.1
railway login
```

The CLI is separate from the npm `railway` dev dependency: that package is the
SDK the CLI evaluates `.railway/railway.ts` against, and it has no
`railway config plan` of its own.

## Step 2 — Plan, staging first

```bash
railway link            # project footy-trends, environment staging, service footy-trends
railway config plan
```

Read the plan before applying. Stop if it:

- deletes or creates anything, a variable included
  (except as listed for a production rebuilt from staging: docs/setup/021 Step 7)
- changes the service's source, repository, branch or `checkSuites` (production waits for CI)
  (the same exception: 021 Step 7 expects `checkSuites` to turn on)
- touches Postgres, Redis or the `predictions` service

The only changes expected are settings that `railway.toml` used to supply.
Their values are the same; only where they come from changes.

## Step 3 — Apply to staging

```bash
railway config apply
```

Then redeploy staging and read the deploy log:

- the pre-deploy step ran `npm run db:migrate`
- the health check on `/api/health` passed

## Step 4 — Production

```bash
railway link            # environment production
railway config plan     # the same checks as Step 2
railway config apply
```

The next release's deploy log shows the same two lines.

## Step 5 — After a change to `.railway/railway.ts`

Merging the change does not apply it. Run Steps 2–4 again.

## Step 6 — A new variable

Add its name to `.railway/railway.ts` (`preserve()`, no value) before the next
apply, or that apply deletes it.

---

## Done when

- [ ] Staging and production each show `railway config plan` with no changes
- [ ] A staging deploy and a production release, after `railway.toml` is gone,
      ran the migrations and passed the health check
- [ ] A docs-only push to `main` deployed nothing
