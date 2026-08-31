# 011 — Branch protection

## Goal
Protect the main branch: the required status checks must satisfy the ruleset
before a merge, history stays linear, and force-pushes are impossible.

*Satisfy*, not *pass* — the distinction runs through this whole page. GitHub
accepts `skipped` and `neutral` alongside `success`, so a satisfied requirement
is **not** proof that a check ran. Two consequences to know before relying on
this page:

- **Human approval is not required.** Required approvals are 0 — Step 2
  explains why, and what stands in for it.
- **A green merge box is not proof of review, or even of CI.** Sourcery reports
  `skipped` when it declines a review. The CI jobs skip entirely for any actor
  other than `OWNER_USERNAME`, `COLLABORATOR_USERNAME` or `renovate[bot]`, and
  a skipped job satisfies the requirement just as a passing one does. Sourcery's
  real gate is the head-commit check in `skills/open-pr.md`.

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

From this point on GitHub blocks a merge until all four checks — the two CI
jobs, SonarCloud, and Sourcery — *satisfy* the requirement.

Satisfy, not pass: GitHub accepts `success`, `skipped` and `neutral` alike.
That distinction is the whole reason for the note below, because Sourcery
reports exactly `skipped` when it declines a review. Only the two CI jobs and
SonarCloud are genuinely gated by this rule; Sourcery's real gate is the
head-commit check in `skills/open-pr.md`, which requires a `success`
conclusion before handoff.

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

## The `release` ruleset

`release` is the branch production deploys from — see
`021-production-environment.md`. It carries its own ruleset, and it differs
from `main`'s in ways that are deliberate rather than oversights.

| Rule | `main` | `release` | Why they differ |
|---|---|---|---|
| Required approvals | **0** | **1** | Zero on `main` so a two-person repo can land its own chores. One on `release` because a release is exactly the case where you want the second pair of eyes — and GitHub forbids approving your own PR, so it takes both people |
| `require_extra_approval_for_unattributed_changes` | on (inert) | **off** | Inert at 0 approvals. At 1 it demands a *second* approval, which two people cannot satisfy when one of them is the author. Left on, it would deadlock every release |
| Merge methods | merge, squash, rebase | **merge only** | A merge commit preserves `main`'s SHAs on `release`, so the deployed commit's ancestry maps back to commits that exist on `main`. Squash and rebase mint new SHAs and break that mapping — and the mapping is the point of wanting a known version in production |
| Linear history | required | **not required** | Follows from merge-commit-only. Requiring both would leave no legal way to merge |
| Required status checks | four | **three** | The `Release — …` jobs from `release.yml`. Added once each had reported at least once, per the note below |
| Require branches to be up to date | **on** | **off** | See *Why `release` does not require an up-to-date branch* below. On `main` it earns its keep; on `release` it would block every release after the first |

Restrict deletions and block force pushes are on for both.

### Why `main` keeps it

The mirror of the section below, and a genuine trade rather than an oversight.

Requiring an up-to-date branch on `main` does real work: parallel pull requests
land there constantly, and it is what forces a branch tested against a stale
`main` to be re-tested. It caught #204 and #212 sitting `BEHIND` on the day this
was written.

Its cost is that every pull request which falls behind must be updated, and
updating by **merge** produces a merge-commit head — on which Sourcery's
required check is unreliable (#236: 5 of 6 merge-commit heads anomalous, against
7 of 7 single-parent heads clean).

**The answer is to rebase rather than merge, not to drop the requirement.** That
keeps the protection and removes the trigger; `skills/open-pr.md` has the
command and the reasoning. It is safe because this ruleset targets
`~DEFAULT_BRANCH` only — feature branches carry no `non_fast_forward` rule — and
because `main` requires 0 approving reviews, so a force-push dismisses nothing.

Turning the requirement off would have been the wrong repair: it treats a
reporting quirk in one tool as a reason to stop testing against current `main`.

### Why `release` does not require an up-to-date branch

`main` requires it. `release` deliberately does not, and turning it back on
would block every release (#221).

A release pull request merges `main` into `release` with a **merge commit** —
that is the row above, and it is what keeps the deployed commit's ancestry
mapping back to `main`. But that merge commit lands only on `release`. From the
first release onwards, `release` therefore holds one commit `main` will never
have, and grows another with each release.

"Require branches to be up to date" means the head branch must contain the
base's tip. So from v1.0.0 onwards, `main` is permanently *behind* `release`,
and every release pull request is unmergeable.

**The usual remedy does not exist here.** GitHub's *Update branch* would merge
`release` into `main`, and `main` requires **linear history** — a merge commit
cannot land there at all, and `non_fast_forward` rules out rewriting it
instead. So the back-merge is not available, and the divergence is permanent.

It is worth being precise about *why*, because the obvious second reason is
wrong. `release` does carry files `main` has deleted — after v1.0.0 it still
held `src/app/sentry-example-page/page.tsx` and two siblings, removed from
`main` by #204. That looks like it would make a back-merge restore deleted
code, and it does not: in a three-way merge `main`'s deletion wins over a
release-side file that was never modified after the branches diverged.
Measured, on those exact commits — the merge applied cleanly and both files
stayed deleted. Linear history is the real blocker, and the only one.

**Dropping it is acceptable rather than free.** `release` only ever receives
merges *from* `main`, so its content becomes `main`'s content at each release
and it cannot accumulate application code that was never built and tested on
`main`. Three kinds of release-only difference are accepted:

- the release merge commits themselves, which carry no content;
- files `main` has deleted, until the next release merge carries that deletion
  across — transient, not permanent;
- anything introduced while resolving a merge conflict, which is the one case
  that could put genuinely unreviewed content on `release`.

The three required `Release — …` checks run on the merge result and the
approving review reads it, so that last case is caught where it matters. What
requiring an up-to-date branch would add is not safety but an impossible
precondition.

On `main` the same setting does earn its keep, because parallel pull requests
genuinely land there — it caught #204 and #212 sitting `BEHIND` on the day this
was written.

```sh
# Verify the asymmetry is still as intended. The ruleset is looked up by name
# rather than by id, because deleting and recreating it changes the id and a
# hard-coded one would quietly 404 instead of failing the check.
release_ruleset=$(gh api repos/:owner/:repo/rulesets --jq '.[] | select(.name=="release") | .id')
gh api "repos/:owner/:repo/rulesets/$release_ruleset" \
  --jq '.rules[] | select(.type=="required_status_checks")
        | .parameters.strict_required_status_checks_policy'   # release -> false
```

The asymmetry is deliberate. Do not "fix" it by switching `release` back on.

Create it the same way as `main`'s, targeting `refs/heads/release` instead of
the default branch, or with the API:

```sh
gh api repos/:owner/:repo/rulesets -X POST --input release-ruleset.json
gh api repos/:owner/:repo/rules/branches/release   # verify what applies
```

**Add the required checks once `release.yml` has reported.** Until then the
merge box goes green on the approval alone, which is the human gate without the
mechanical one. The same is true of Railway's *Wait for CI*: it cannot be
enabled until a workflow has a `push` trigger for `release`.

---

## Done when
- [ ] Branch ruleset active on main
- [ ] Direct push to main rejected
- [ ] Required status checks added (after `013-ci-workflow.md`)
- [ ] `release` ruleset active, with 1 required approval and merge commits only
- [x] `release`'s required status checks added (after `release.yml` first reports)
- [x] `release` does **not** require an up-to-date branch, for the reason above (#221)

## Next
→ Setup continues in `021-production-environment.md`, which stands up the
  environment this branch deploys to.