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

## Known limitations

Three behaviours that are easy to misread, and that the merge gate in
`skills/open-pr.md` depends on.

### Reviews after the first push are lighter

Sourcery reviews thoroughly when a PR opens and reacts to **every** push
after that — no setting enables this. But those later reactions are
deliberately lighter: they re-check existing comments, resolve threads the
new code addressed, and re-run security scans. They do **not** regenerate
the summary, the reviewer's guide, or the full set of inline comments.

A consequence worth knowing: a light reaction creates no new review object,
so the latest review's `commit_id` keeps pointing at the first reviewed
commit even though later commits were seen. Never treat that value as
"the last commit Sourcery looked at".

To get a complete review of the final state — worth doing after substantive
fix commits — comment `@sourcery-ai review` on the PR.

### Three separate things cause a skip

The check reports `skipped`, and the causes need telling apart:

| Cause | Limit | Remedy |
|---|---|---|
| Per-PR size cap | 300,000 diff characters | split the work |
| Rolling seven-day budget | 1,500,000 diff characters per seat | wait for the reset; splitting does not help |
| Automatic re-review cap | 5 per PR | `@sourcery-ai review` resets the counter |

`@sourcery-ai review` forces a full review but does not create budget, so it
only clears the third case.

Both size numbers are **plan-dependent** — the table above is Sourcery Pro,
which is what this repo is on. For reference, since the plan has changed
before:

| Plan | Per PR | Rolling 7 days |
|---|---|---|
| Open Source | 150,000 | 250,000 per developer |
| **Pro** (this repo) | **300,000** | **1,500,000 per seat** |
| Team / Enterprise | 500,000 | 2,500,000 per seat |

Source: <https://docs.sourcery.ai/admin/plans/>. Confirmed for this account on
2026-08-25, which matters because the repo is public and Sourcery applies the
Open Source plan to public repositories by default — the pricing page alone
does not settle which row applies here.

If a skip ever disagrees with these numbers, re-check that page before assuming
the diff was miscounted: the plan is the likelier thing to have moved, and the
skip message itself states the cap that was applied.

Sourcery's docs also state that "a rate limit never blocks a merge": it skips
the review and the check goes green. That is precisely why the merge gate
verifies a real review of the head commit rather than the check's colour.

### Read the check-run at the commit, not the PR

`gh pr checks <PR>` reports the *latest* check state, not the state at a
given commit. A skipped review on an earlier commit is invisible there once
a later one succeeds. Query the head SHA directly:

```sh
HEAD=$(gh pr view <PR> --json headRefOid -q .headRefOid)
gh api "repos/:owner/:repo/commits/$HEAD/check-runs" \
  -q '.check_runs[]|select(.name|test("Sourcery";"i"))|.conclusion'
```

---

## Done when
- [ ] Sourcery installed on repo
- [ ] `.sourcery.yaml` committed
- [ ] Review rules added in the dashboard
- [ ] Dummy PR confirmed Sourcery fires

## Next
→ `005-railway-setup.md`