# 010 — Renovate setup

## Goal
Install Renovate on the repository so dependency updates are raised automatically
as pull requests, reviewed by Sourcery and SonarCloud like any other PR, and
never silently fall behind.

---

## Step 1 — Install the Renovate GitHub App

1. Go to https://github.com/apps/renovate
2. Click **Install**
3. Select the **koodauspaja** organisation
4. Under **Repository access**, choose **Only select repositories** and pick `footy-trends`
5. Confirm the installation

---

## Step 2 — `renovate.json`

The configuration arrives with the clone:
[`renovate.json`](../../renovate.json). Renovate finds it and needs no
onboarding.

A few decisions baked into this config worth knowing:

| Setting | Value | Reason |
|---------|-------|--------|
| `schedule` | Monday before 7am | Updates arrive at the start of the week, not randomly mid-sprint |
| `prConcurrentLimit` | 10 | Caps the batch when many deps update at once |
| `automerge` | false | Every update goes through Sourcery + SonarCloud review — nothing merges unreviewed |
| `timezone` | Europe/Helsinki | Schedule fires at a sensible local time |
| `lockFileMaintenance` | enabled | Refreshes transitive deps the manifest alone never moves |
| `customManagers` | The stated npm version | README.md and INSTALL.md repeat the `packageManager` pin, and `tests/unit/scripts/setup-plan.test.ts` fails when they disagree with it. The manager bumps them in the same PR — see `tests/unit/config/renovate-npm-docs.test.ts` (#461) |
| `packageRules` | TypeScript `<7` | TypeScript 7 ships no in-process parser, and three tests read our own source as an AST. The config carries the full reason; see #43 |

---

## Step 3 — Close the onboarding PR, if one appears

With `renovate.json` already present, Renovate should open none. Close it if
it does: the committed file is the configuration.

`ci.yml` and `sonarcloud.yml` already run for `renovate[bot]`, beside the two
usernames of 001.

---

## Step 4 — Verify

1. Go to your repo → **Pull requests** — Renovate may open its first batch of
   dependency PRs on the next scheduled run (Monday morning) or shortly after
   the config is detected
2. Confirm each PR has the `dependencies` label
3. Confirm SonarCloud and any other CI workflows trigger on the PR

---

## Done when
- [ ] Renovate GitHub App installed on `footy-trends`
- [ ] First Renovate dependency PR appears and CI runs on it

## Next
→ `011-branch-protection.md`
