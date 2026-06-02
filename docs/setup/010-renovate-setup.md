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

Renovate will open an onboarding PR titled *Configure Renovate* within a few
minutes. Do not merge it yet — configure it first in the next step.

---

## Step 2 — Create `renovate.json`

Rather than accepting Renovate's default config from the onboarding PR, create
the config file yourself so it is intentional and documented.

Create file: `renovate.json` in the repo root.

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended"
  ],
  "timezone": "Europe/Helsinki",
  "schedule": ["before 7am on Monday"],
  "prConcurrentLimit": 3,
  "prHourlyLimit": 2,
  "labels": ["dependencies"],
  "assignees": ["your-github-username"],
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch"],
      "matchCurrentVersion": "!/^0/",
      "automerge": false
    },
    {
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": false
    }
  ]
}
```

A few decisions baked into this config worth knowing:

| Setting | Value | Reason |
|---------|-------|--------|
| `schedule` | Monday before 7am | Updates arrive at the start of the week, not randomly mid-sprint |
| `prConcurrentLimit` | 3 | Avoids a wall of PRs when many deps update at once |
| `automerge` | false | Every update goes through Sourcery + SonarCloud review — nothing merges unreviewed |
| `timezone` | Europe/Helsinki | Schedule fires at a sensible local time |

---

## Step 3 — Close the onboarding PR

Once you have committed `renovate.json`, Renovate will detect it and close its
own onboarding PR automatically. If it does not close within a few minutes,
close it manually — the config file is the source of truth.

---

## Step 4 — Add Renovate to the PR actor allowlist

Renovate opens PRs as the `renovate[bot]` actor. Update any workflow `if:`
guards to let it trigger CI:

```yaml
if: |
  github.actor == 'your-github-username' ||
  github.actor == 'friends-github-username' ||
  github.actor == 'renovate[bot]'
```

Apply this to `.github/workflows/sonarcloud.yml` and any other workflow files
created later. Without this, Renovate PRs will not get SonarCloud or test
coverage analysis.

---

## Step 5 — Commit and verify

```bash
git add renovate.json
git commit -m "chore: add Renovate config"
git push origin main
```

1. Go to your repo → **Pull requests** — Renovate may open its first batch of
   dependency PRs on the next scheduled run (Monday morning) or shortly after
   the config is detected
2. Confirm each PR has the `dependencies` label
3. Confirm SonarCloud and any other CI workflows trigger on the PR

---

## Done when
- [ ] Renovate GitHub App installed on `footy-trends`
- [ ] `renovate.json` committed to repo root
- [ ] `renovate[bot]` added to workflow actor allowlists
- [ ] Onboarding PR closed
- [ ] First Renovate dependency PR appears and CI runs on it

## Next
→ `012-project-init.md`
