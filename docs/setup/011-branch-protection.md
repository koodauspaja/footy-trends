# 011 — Branch protection

## Goal
Protect the main branch so nothing merges without passing CI, a SonarCloud
quality gate, and at least one peer review. Enforces the workflow that
Sourcery, SonarCloud, and the PR template set up.

> **Status: a ruleset exists but is disabled.** As of 2026-08-22 a
> repository ruleset named `main` is present (created 2026-06-03) with
> `enforcement: "disabled"`, so no rule currently applies:
>
> ```sh
> gh api repos/:owner/:repo/rulesets            # -> enforcement: "disabled"
> gh api repos/:owner/:repo/rules/branches/main # -> []   (nothing applies)
> ```
>
> Check both. `gh api repos/:owner/:repo/branches/main/protection` returns
> 404 here, but that endpoint only covers *classic* branch protection —
> a 404 there says nothing about rulesets, which are a separate API.
>
> So the steps below are about configuring and **enabling** the existing
> ruleset rather than creating one. Until that happens the review gate is
> upheld by process (`skills/open-pr.md`), not mechanically.

---

## Step 1 — Enable branch protection

1. Go to your GitHub repo → **Settings** → **Branches**
2. Click **Add branch ruleset**
3. Name: `main`
4. Target branches: **Default branch**

---

## Step 2 — Configure the rules

Enable the following:

### Restrict deletions
- [x] **Restrict deletions** — nobody can delete the main branch

### Require a pull request before merging
- [x] **Require a pull request before merging**
  - Required approvals: **1**
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [ ] Require review from Code Owners — leave off for now

### Require status checks to pass
- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Add the following required checks (these appear once the workflows have
    run at least once on a PR):
    - `Typecheck, lint, unit and integration test`
    - `SonarCloud scan`
    - `Sourcery review`

> **Note:** the status check names won't be available to select until each
> workflow has run on a PR at least once. Come back and add them after
> completing `013-ci-workflow.md` and opening the test PR there.

### Block force pushes
- [x] **Block force pushes** — prevents rewriting history on main

### Require linear history
- [x] **Require linear history** — enforces squash or rebase merges,
  keeping the main branch history clean and bisectable

---

## Step 3 — Save and verify

1. Click **Create** to save the ruleset
2. Confirm the rules are active: go to **Settings** → **Branches** and check
   the ruleset is listed
3. Try pushing directly to main — GitHub should reject it:
   ```bash
   git checkout main
   echo "// direct push test" >> README.md
   git add README.md
   git commit -m "test: should be rejected"
   git push origin main
   # Expected: error: failed to push some refs
   ```
4. Revert the test commit locally:
   ```bash
   git reset HEAD~1
   ```

---

## Step 4 — Wire up required status checks

1. Go to repo → **Settings** → **Branches** → your `main` ruleset → **Edit**
2. Under **Require status checks to pass**, click **Add checks**
3. Search for and add:
   - `Typecheck, lint, unit and integration test`
   - `SonarCloud scan`
   - `Sourcery review`
4. Save

From this point on, a PR cannot merge unless all three checks pass.

> **Verify `Sourcery review` before relying on it.** GitHub has historically
> treated a `skipped` check conclusion as satisfying a required status
> check. Sourcery reports exactly that when it declines a review — a quota
> or re-review-cap skip — which is the case the gate in
> `skills/open-pr.md` exists to catch. If skipped does satisfy the
> requirement here, protection will not block that case and the process
> check remains the real gate. Confirm on a throwaway PR rather than
> assuming.

---

## Done when
- [ ] Branch ruleset active on main
- [ ] Direct push to main rejected
- [ ] Required status checks added (after `013-ci-workflow.md`)

## Next
→ Setup complete. All eighteen infrastructure steps are done.
  Start with the first feature spec: `specs/001-standings-form-table.md`