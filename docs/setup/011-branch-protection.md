# 011 — Branch protection

## Goal
Protect the main branch so nothing merges without passing CI and a SonarCloud
quality gate, and so history stays linear and force-pushes are impossible.

Human review is part of the workflow (`skills/open-pr.md`) but is deliberately
**not** a merge prerequisite — required approvals are 0, for the reasons in
Step 2.

> **Status: the ruleset is active.** The repository ruleset named `main` was
> `enforcement: "disabled"` as of 2026-08-22; it is enabled as of 2026-08-26,
> and a direct push to `main` is now rejected with "push declined due to
> repository rule violations".
>
> ```sh
> gh api repos/:owner/:repo/rulesets            # -> enforcement: "active"
> gh api repos/:owner/:repo/rulesets/<id>       # -> the required checks
> gh api repos/:owner/:repo/rules/branches/main # -> what applies to main
> ```
>
> Check those, not `gh api repos/:owner/:repo/branches/main/protection`, which
> returns **404** here: that endpoint covers only *classic* branch protection,
> and a 404 there says nothing about rulesets. Reading the 404 as
> "`main` is unprotected" is the mistake this note exists to prevent.
>
> **Renaming a CI job is the case that bites.** A required check that stops
> reporting never turns green, so it blocks every merge until the ruleset is
> updated to the new name. That happened when `Typecheck, lint, unit and
> integration test` became two checks (#158); the ruleset was updated in the
> same change.

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
  - Required approvals: **0**
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [ ] Require review from Code Owners — leave off for now

  Zero is deliberate, not an oversight. On a two-person repo a required
  approval means nobody can land their own work, including small chores and
  Renovate bumps.

  What replaces it is a *process* gate, not a mechanical one, and the
  difference matters: Sourcery reports `skipped` when it declines a review, and
  GitHub treats a skipped required check as satisfied. So a PR can show four
  green checks with no Sourcery review at all. `skills/open-pr.md` therefore
  requires querying the check-run at the head commit and confirming a real
  review before handing off — that step, not the merge button, is what actually
  enforces review here. See the note under Step 4.

  Raise it to 1 if the repo grows past two people. Note that
  `require_extra_approval_for_unattributed_changes` is on and currently inert:
  at 1 approval it would additionally demand a second approval for commits not
  attributed to a GitHub account.

### Require status checks to pass
- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Add the following required checks (these appear once the workflows have
    run at least once on a PR):
    - `Typecheck, lint and unit tests`
    - `Integration tests`
    - `SonarCloud scan`
    - `Sourcery review`

> **Note:** the status check names won't be available to select until each
> workflow has run on a PR at least once. Come back and add them after
> completing `013-ci-workflow.md` and opening the test PR there.

> **Merge methods.** The ruleset still allows `merge` alongside `squash` and
> `rebase`, which linear history rejects anyway — so a merge commit is blocked
> by the rule below rather than by the method list. Harmless, but narrowing the
> allowed methods to squash and rebase would make the intent explicit.

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
   - `Typecheck, lint and unit tests`
   - `Integration tests`
   - `SonarCloud scan`
   - `Sourcery review`
4. Save

From this point on, a PR cannot merge unless all four checks pass — the two CI
jobs, SonarCloud, and Sourcery.

> **A required check cannot enforce the Sourcery gate.** GitHub's own
> documentation is explicit: *"Required status checks must have a
> `successful`, `skipped`, or `neutral` status before collaborators can
> make changes to a protected branch."*
>
> Sourcery reports exactly `skipped` when it declines a review — over the
> per-PR size cap, out of rolling seven-day budget, or past the
> five-automatic-re-review cap. A skipped check **satisfies** the requirement, so protection will
> happily allow a merge with no Sourcery review at all. That is precisely
> the case the hard block exists for.
>
> Adding `Sourcery review` as a required check is still worth doing: it
> catches an outright *failure*, and it makes the expectation visible. But
> the skip case is upheld by the process check in `skills/open-pr.md`, not
> mechanically. Do not treat a green merge box as evidence Sourcery ran.
>
> The same caveat applies to any check that can skip itself — a CI job
> behind a path filter, for example.

---

## Done when
- [ ] Branch ruleset active on main
- [ ] Direct push to main rejected
- [ ] Required status checks added (after `013-ci-workflow.md`)

## Next
→ Setup complete. All eighteen infrastructure steps are done.
  Start with the first feature spec: `specs/001-standings-form-table.md`