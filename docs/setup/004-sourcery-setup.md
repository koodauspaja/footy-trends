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

**A rule's path patterns must include every file the rule asks about.**
Sourcery judges a rule from the matching files only; scoped away from its own
subject it does not fall silent, it guesses. One block per subject, so paths
stay matched to it (Sourcery recommends fewer than 3 rules per block).

**Block 1** — path: `specs/**,decisions/**`
```
- A decision record in decisions/ must faithfully interpret the spec it is named after. The two share a number: specs/029-forced-season-refresh.md and decisions/029-forced-season-refresh.md. Flag any drift, e.g. the spec says "show last 5 matches" and the decision record says "show last 3".
```

**Block 2** — path: `src/**/*.ts,src/**/*.tsx`
```
- All user-facing strings must be in Finnish. Variable names, function names, comments, and code must be in English.
- Responses from every external data provider must be cached — football-data.org and TASO alike. Never call a provider on every page load or render.
```

**Block 3** — path: `src/**/*.ts,src/**/*.tsx,tests/**/*.ts,tests/**/*.tsx,specs/**`
```
- Every new feature must have corresponding tests in tests/.
- Tests should cover the happy path and the edge cases defined in the spec.
```

**Block 4** — path: `**`
```
- No API key, secret, token or credential may be introduced or modified by this pull request. Clearly marked placeholders are not secrets: .env.example carries variable names with empty or obviously fake values (user:password@localhost), and setup docs show example values. Real values must come from environment variables.
```

**Block 5** — path: `tests/**/*.ts,tests/**/*.tsx,specs/**`
```
- A spec or test covering provider data must state the expected cache policy: which endpoints are cached and their TTL. Flag a spec that adds a provider call without one, and a test whose cache expectations contradict its spec.
```

Each block's paths are chosen to cover every file its rules ask about.
`REVIEW_RULES.md` records why each one is there, and which requirements are
deliberately not Sourcery rules.

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

Behaviours that are easy to misread, and that the merge gate in
`skills/open-pr.md` depends on. This list has been counted wrong in its own
opening line before, so it no longer carries a count.

### A rule cannot see the pull request description

From Sourcery's documentation: "A rule only looks at the lines the pull
request changes." The description is not a changed line, so no rule can check
it. Sourcery *can* read repository files outside the diff, so this limit is
specifically the description.

Such a rule answers anyway rather than falling silent: one fired three times
on #381 against a PR that satisfied it, and never on #375, which was
identical in the respect it claimed to check. A rule that fires inconsistently
across similar PRs is usually being asked for evidence it cannot obtain.

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

| Cause | Remedy |
|---|---|
| Per-PR size cap | split the work; waiting never shrinks a diff |
| Rolling seven-day budget | wait for enough of the window to expire; splitting spends it faster |
| Automatic re-review cap (5 per PR) | `@sourcery-ai review` resets the counter |

`@sourcery-ai review` forces a full review but does not create budget, so it
only clears the third case.

### The two size limits depend on the plan

A fresh setup lands on the **Open Source** plan — Sourcery applies it to public
repositories by default — so that is what these steps get you:

| Plan | Per PR | Rolling 7 days |
|---|---|---|
| **Open Source** (a new setup) | **150,000** | **250,000 per developer** |
| Pro | 300,000 | 1,500,000 per seat |
| Team / Enterprise | 500,000 | 2,500,000 per seat |

The second limit is a *rolling seven-day budget*, not a weekly quota: the
window slides, so there is no reset to wait for.

**This repo is on Pro**, so its working numbers are the middle row.
`skills/open-pr.md` carries them, and is the file to check before sizing a PR
— this page describes what setting Sourcery up gives you, not what this repo
currently has.

Source: <https://docs.sourcery.ai/admin/plans/>, plan confirmed for this
account on 2026-08-25. If a skip ever disagrees with these numbers, re-check
that page before assuming the diff was miscounted: the plan is the likelier
thing to have moved, and the skip message itself states the cap that was
applied.

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
- [ ] Every rule's path patterns include the files that rule asks about
- [ ] Dummy PR confirmed Sourcery fires

## Next
→ `005-railway-setup.md`