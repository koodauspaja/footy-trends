# 004 — Sourcery setup

## Goal
Install Sourcery on the repository, configure project-specific review rules
in the dashboard, and verify it works with a dummy PR.

---

## Step 1 — Install Sourcery

1. Go to https://sourcery.ai
2. Sign in with GitHub
3. Click **Add a repository** and select `footy-trends`
4. Sourcery will install itself as a GitHub App on the repo

---

## Step 2 — Create `.sourcery.yaml`

Create file: `.sourcery.yaml` in the repo root.

```yaml
rule_settings:
  enable:
    - default
```

That's all that goes here. Path restrictions and review rules are configured
in the dashboard, not in this file.

---

## Step 3 — Add review rules in the dashboard

Go to https://app.sourcery.ai → **Review Settings** → **Review Rules**.

Add the following rules. Where noted, set the path pattern to
`src/**/*.ts,src/**/*.tsx,tests/**/*.ts` so the rule only applies to source
code and not to specs, decisions, or docs.

Add each rule as a separate block (Sourcery recommends fewer than 3 rules per block):

**Block 1** — path: `src/**/*.ts,src/**/*.tsx,tests/**/*.ts`
```
- Every PR must reference a spec file in specs/ via the PR template.
- Every PR must reference a decision record in decisions/ via the PR template.
- The decision record must faithfully interpret the spec — flag any drift, e.g. spec says "show last 5 matches" but decisions doc says "show last 3".
```

-**Block 2** — path: `src/**/*.ts,src/**/*.tsx`
```
- All user-facing strings must be in Finnish. Variable names, function names, comments, and code must be in English.
- API responses from football-data.org must be cached. Never call the API on every page load or render.
- No API keys or secrets may appear in code or committed files. All secrets must come from environment variables.
```

**Block 3** — path: `src/**/*.ts,src/**/*.tsx,tests/**/*.ts`
```
- Every new feature must have corresponding tests in tests/.
- Tests should cover the happy path and the edge cases defined in the spec.
```

> Sourcery's `noExplicitAny` and `noConsoleLog` rules are already enforced
> at the tooling level by Biome (set up in `012-project-init.md`), so no
> need to duplicate them here.

---

## Step 4 — Commit the config file

```bash
git add .sourcery.yaml
git commit -m "chore: add Sourcery config"
git push origin main
```

---

## Step 5 — Test with a dummy PR

Create a throwaway branch to confirm Sourcery fires and posts a review comment:

```bash
git checkout -b test/sourcery-check
echo "// test file" > src/test-sourcery.ts
git add src/test-sourcery.ts
git commit -m "test: dummy file to trigger Sourcery review"
git push origin test/sourcery-check
```

Open a PR from this branch to main on GitHub. Within a few minutes Sourcery
should add a review comment. Confirm:

- [ ] Comment appears on the PR
- [ ] PR template loaded correctly

Delete the branch and close the PR without merging once confirmed.

---

## Done when
- [ ] Sourcery installed on repo
- [ ] `.sourcery.yaml` committed
- [ ] Review rules added in the dashboard
- [ ] Dummy PR confirmed Sourcery fires

## Next
→ `005-railway-setup.md`