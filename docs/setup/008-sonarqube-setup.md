# 008 — SonarQube Cloud setup

## Goal
Connect the repository to SonarQube Cloud's free tier so every pull request
gets automatic static analysis — catching bugs, code smells, and security
issues before merge.

---

## Step 1 — Create or reuse a SonarQube Cloud account

1. Go to https://sonarcloud.io
2. Sign in with GitHub (uses the same account as your other projects)
3. If you already have an organisation there from your previous project, skip
   to Step 2 — you can add `footy-trends` to the existing organisation

---

## Step 2 — Add the repository

1. In SonarCloud → **+** → **Analyze new project**
2. Select the **koodauspaja** GitHub organisation
3. Tick `footy-trends` and click **Set Up**
4. Choose **Free plan** (public repos are always free on SonarCloud)
5. Select **With GitHub Actions** as the analysis method — this is the cleanest
   integration for a CI pipeline

---

## Step 3 — Store the token in GitHub

SonarCloud will generate a `SONAR_TOKEN` during setup. Store it as a GitHub
Actions secret so the workflow can authenticate:

1. Copy the token SonarCloud shows you
2. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `SONAR_TOKEN`
5. Value: paste the token
6. Save

Also note your `SONAR_PROJECT_KEY` and `SONAR_ORGANIZATION` — shown in the
SonarCloud setup screen. You will need these in the properties file.

---

## Step 4 — Add repository variables for the CI actor allowlist

Workflows use repository variables (not secrets) to control which GitHub actors
are allowed to trigger CI. Variables are accessible in `if:` conditions;
secrets are not.

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click the **Variables** tab
3. Click **New repository variable** and add:

| Name | Value |
|------|-------|
| `OWNER_USERNAME` | your GitHub username |
| `COLLABORATOR_USERNAME` | your friend's GitHub username |

These are referenced in every workflow `if:` guard as `vars.OWNER_USERNAME` and
`vars.COLLABORATOR_USERNAME`. If a username ever changes, update it here once
rather than in every workflow file.

---

## Step 5 — Create the analysis workflow

Create file: `.github/workflows/sonarcloud.yml`

```yaml
name: SonarCloud analysis

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  sonarcloud:
    name: SonarCloud scan
    runs-on: ubuntu-latest
    if: |
      github.actor == vars.OWNER_USERNAME ||
      github.actor == vars.COLLABORATOR_USERNAME ||
      github.actor == 'renovate[bot]'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for SonarCloud blame data

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm test

      - name: SonarCloud scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

---

## Step 6 — Create sonar-project.properties

Create file: `sonar-project.properties` in the repo root.

```properties
sonar.projectKey=YOUR_PROJECT_KEY
sonar.organization=YOUR_ORGANIZATION

sonar.sources=src
sonar.tests=tests

sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.typescript.tsconfigPath=tsconfig.json

# Exclude generated files and config from analysis
sonar.exclusions=**/*.spec.ts,**/node_modules/**,**/dist/**
sonar.coverage.exclusions=**/*.spec.ts
```

Replace `YOUR_PROJECT_KEY` and `YOUR_ORGANIZATION` with the values from
Step 3. These are not secrets — it is fine to commit them.

---

## Step 7 — Commit and verify

```bash
git add .github/workflows/sonarcloud.yml sonar-project.properties
git commit -m "chore: add SonarCloud analysis workflow"
git push origin main
```

1. Go to GitHub → **Actions** — the SonarCloud workflow should appear and run
2. Go to https://sonarcloud.io → your project — results appear within a minute
   or two of the workflow completing
3. Open a test PR and confirm SonarCloud posts a quality gate comment on it

---

## Done when
- [ ] SonarCloud project created and linked to `footy-trends`
- [ ] `SONAR_TOKEN` stored as a GitHub Actions secret
- [ ] `OWNER_USERNAME` and `COLLABORATOR_USERNAME` stored as repository variables
- [ ] `sonarcloud.yml` workflow triggers on push and PR
- [ ] `sonar-project.properties` committed with correct project key and org
- [ ] Quality gate comment appears on a test PR

## Next
→ `009-axiom-logs.md`