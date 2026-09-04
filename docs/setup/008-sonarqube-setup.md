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
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          check-latest: true

      - name: Install dependencies
        run: npm ci --ignore-scripts

      - name: Run tests with coverage
        run: npm test

      # The newest release tag becomes the project version, which is what the
      # "previous version" new-code definition measures against. Not
      # `git describe`: a release tag sits on a merge commit created on
      # `release`, which `main` cannot reach.
      - name: Read the last release tag
        id: version
        run: |
          tag="$(git tag --list 'v*' --sort=-v:refname | head -n 1)"
          echo "value=${tag:-0.0.0}" >> "$GITHUB_OUTPUT"

      # `sonarcloud-github-action` is archived and deprecated. Pin the
      # replacement by SHA, never `@master`.
      - name: SonarCloud scan
        uses: SonarSource/sonarqube-scan-action@22918119ff8e1ca75a623e15c8296b6ea4fbe28f # v8.2.1
        with:
          args: >-
            -Dsonar.projectVersion=${{ steps.version.outputs.value }}
            -Dsonar.scanner.skipNodeProvisioning=true
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

# The whole repository, not just `src`. The stock profiles for GitHub Actions,
# Secrets, YAML, JSON and Docker only ever see a file if it is indexed, and a
# committed API key is exactly what they are for.
sonar.sources=.
sonar.tests=tests

sonar.javascript.lcov.reportPaths=coverage/lcov.info

# Build output, dependencies and generated reports.
#
# `tests/**` belongs here too: `sonar.sources=.` contains it and `sonar.tests`
# claims it, and a file indexed as both source and test fails the analysis.
# This property applies to main sources only, so the tests are still analysed
# as tests.
sonar.exclusions=tests/**,package-lock.json,node_modules/**,.next/**,coverage/**

# Derive this list, do not copy it — see below.
sonar.coverage.exclusions=
```

### Deriving the coverage exclusions

Every source file absent from the lcov report is scored 0% by the Zero Coverage
Sensor, so widening the scope means naming what cannot be covered. The list is
project-specific and this repository's has twenty-one entries; the guide
deliberately does not reproduce it, because a copy here would drift from the
real one silently.

Derive it instead. After a coverage run, every tracked JS/TS file absent from
the report is a file the sensor would score 0%:

```bash
npm run test:unit
comm -23 \
  <(git ls-files '*.ts' '*.tsx' '*.mjs' | grep -v '^tests/' | sort) \
  <(grep '^SF:' coverage/lcov.info | cut -d: -f2 | sort)
```

Every line it prints must then appear in `sonar.coverage.exclusions` — or,
better, gain a test. The command lists candidates and does not subtract what is
already excluded, so read its output against the property rather than expecting
it to fall empty. Two rules:

- **Name files, never a directory.** `scripts/**` is shorter and wrong: it also
  discards the halves that *are* tested, reporting covered code as excluded.
- **A pattern matching nothing is worse than no pattern**, because it looks
  load-bearing in review. Check every entry still names a file that exists —
  two in this repository outlived their files by months.

There is no `sonar.typescript.tsconfigPath`. The property is `tsconfigPaths`,
plural, and unset the analyzer traverses from the project root and finds
`tsconfig.json` by itself — so leave it out.

The authoritative version of this file is the one in the repository root; this
block is the shape to start from, not a copy to maintain in two places. See
#258 for how each line was arrived at.

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