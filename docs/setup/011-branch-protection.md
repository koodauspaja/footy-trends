# 011 — Branch protection

## Goal
Protect the main branch so nothing merges without passing CI, a SonarCloud
quality gate, and at least one peer review. Enforces the workflow that
Sourcery, SonarCloud, and the PR template set up.

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
    - `CI / Typecheck, lint, test`
    - `SonarCloud / SonarCloud scan`

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

## Done when
- [ ] Branch ruleset active on main
- [ ] Direct push to main rejected
- [ ] Required status checks added (after `013-ci-workflow.md`)

## Next
→ `012-project-init.md`