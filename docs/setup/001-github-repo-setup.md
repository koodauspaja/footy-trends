# 001 — GitHub repository setup

## Goal
Create the public GitHub repository with the agreed folder structure.

## Prerequisites
- GitHub account
- Git installed locally
- GitHub CLI (`gh`) optional but recommended — install from https://cli.github.com

---

## Step 1 — Create the repository

### Option A: GitHub CLI (recommended)
```bash
gh repo create koodauspaja/footy-trends --public --description "Finnish-language European football trends dashboard" --clone
cd footy-trends
```

### Option B: Manual
1. Go to https://github.com/new
2. Under **Owner**, select **koodauspaja** (not your personal account)
3. Name: `footy-trends`
4. Visibility: **Public**
5. Add a README: yes
6. .gitignore: **Node**
7. Clone locally after creation

---

## Step 2 — Create the folder structure

Run this from the root of the cloned repo:

```bash
mkdir -p specs decisions src tests docs/setup skills .github/workflows .github/ISSUE_TEMPLATE

# Placeholder files so folders are tracked by git
touch specs/.gitkeep
touch decisions/.gitkeep
touch skills/.gitkeep

# Root config files
touch .sourcery.yaml
touch REVIEW_RULES.md
```

---

## Step 3 — Copy the setup docs into the repo

Copy all the numbered setup guides into `docs/setup/` so Claude Code can
reference them when implementing features.

```bash
cp /path/to/your/setup-docs/*.md docs/setup/
```

The folder should contain:

```
docs/setup/
  README.md
  001-github-repo-setup.md
  002-github-project-board.md
  003-pr-template.md
  004-sourcery-setup.md
  005-railway-setup.md
  006-railway-verify.md
  007-football-data-api.md
  008-sonarqube-setup.md
  009-axiom-logs.md
  010-renovate-setup.md
  011-branch-protection.md
  012-project-init.md
  013-ci-workflow.md
  014-google-oauth-setup.md
  015-database-setup.md
  016-redis-cache-setup.md
  017-sentry-setup.md
  018-health-check.md
```

These are read-only reference docs — do not edit them during the setup process.
If you discover a mistake or want to add a step, update the file and commit the
change at that point with a note in the commit message.

---

## Step 4 — Create the README

Create `README.md` with the following content:

```markdown
# Footy Trends

Finnish-language European football trends dashboard covering the Champions League
and top 5 leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1).

Built with TypeScript. Data from football-data.org.

## Project structure

| Folder | Purpose |
|--------|---------|
| `specs/` | Feature specifications written by humans (English) |
| `decisions/` | Architecture Decision Records written by the coding agent |
| `src/` | Application source code |
| `tests/` | Automated tests |
| `docs/setup/` | One-time infrastructure setup guides |
| `skills/` | Reusable agent instructions |
| `.github/` | GitHub Actions workflows, issue and PR templates |

## Development process

See `docs/setup/README.md` for the infrastructure setup sequence.
```

---

## Step 5 — Create a basic .gitignore

If not generated automatically, add to `.gitignore`:

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

---

## Step 6 — Initial commit and push

```bash
git add .
git commit -m "chore: initial repo structure and setup docs"
git push origin main
```

---

## Step 7 — Add your friend as collaborator

Since the repo lives under the **koodauspaja** organisation, both of you need org membership and repo access:

1. Go to https://github.com/orgs/koodauspaja/people → **Invite member** → add your friend's GitHub username
2. Friend accepts the organisation invitation
3. Go to repo → **Settings** → **Collaborators and teams** → add your friend with **Write** access

---

## Step 8 — Block outsiders from running GitHub Actions

Because the repo is public, strangers can fork it and open PRs. Without protection
they could trigger your Actions workflows and burn your free minutes.

### Method A: GitHub's built-in fork protection (recommended — do this first)

1. Go to repo → **Settings** → **Actions** → **General**
2. Scroll to **Fork pull request workflows from outside collaborators**
3. Select **Require approval for all outside collaborators**
4. Save

Effect: if someone outside your collaborators opens a PR, the workflow will not
run until one of you clicks "Approve and run" in GitHub. Your own pushes and
each other's PRs run immediately without any extra step.

### Method B: Restrict by actor in the workflow YAML (belt-and-braces)

Add an `if` condition to any workflow job so it exits immediately if the
triggering user is not one of you. The variables `OWNER_USERNAME` and
`COLLABORATOR_USERNAME` are set up as repository variables in `008-sonarqube-setup.md`.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    if: |
      github.actor == vars.OWNER_USERNAME ||
      github.actor == vars.COLLABORATOR_USERNAME ||
      github.actor == 'renovate[bot]'
    steps:
      - uses: actions/checkout@v4
      # ... rest of steps
```

This acts as a second layer: even if the fork-protection setting is ever changed
by mistake, unknown actors are still stopped at the job level.

> **Recommended approach:** apply Method A now (one settings click), and add the
> `if` condition in Method B when you create your first workflow file.

---

## Done when
- [ ] Repo is public and visible on GitHub
- [ ] All folders exist in the repo
- [ ] Setup docs copied into `docs/setup/`
- [ ] Friend has collaborator access
- [ ] README is readable and accurate
- [ ] Fork PR workflow approval set to "Require approval for all outside collaborators"

## Next
→ `002-github-project-board.md`