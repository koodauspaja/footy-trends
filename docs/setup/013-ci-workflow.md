# 013 — CI workflow

## Goal
Add a GitHub Actions workflow that runs on every pull request and push to main:
type checking, Biome linting, and tests. Combined with the SonarCloud workflow
from `008-sonarqube-setup.md`, this gives full coverage before anything merges.

---

## Step 1 — Create the workflow file

Create file: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  ci:
    name: Typecheck, lint, test
    runs-on: ubuntu-latest
    if: |
      github.actor == vars.OWNER_USERNAME ||
      github.actor == vars.COLLABORATOR_USERNAME ||
      github.actor == 'renovate[bot]'

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test
```

---

## Step 2 — Confirm the SonarCloud workflow is up to date

The SonarCloud workflow created in `008-sonarqube-setup.md` should already be
correct — it uses `npm test` (not `npm test -- --coverage`), includes
`renovate[bot]` in the `if:` guard, and runs tests to produce the coverage
report that SonarCloud needs.

Open `.github/workflows/sonarcloud.yml` and confirm it matches this:

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
          fetch-depth: 0

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

> SonarCloud needs to run tests itself to collect the coverage report — it
> cannot read the artifact from the CI job. Tests running in both workflows
> is expected and correct, not duplication to fix.

---

## Step 3 — Commit and open a test PR

```bash
git add .github/workflows/ci.yml
git commit -m "chore: add CI workflow"
git push origin main
```

Then open a test PR to confirm both workflows trigger:

```bash
git checkout -b test/ci-check
echo "// ci test" >> src/app/page.tsx
git add src/app/page.tsx
git commit -m "test: trigger CI on PR"
git push origin test/ci-check
```

Open a PR from `test/ci-check` to main. Confirm:

- [ ] `CI / Typecheck, lint, test` appears and passes
- [ ] `SonarCloud / SonarCloud scan` appears and passes
- [ ] Both are visible as status checks on the PR

Once confirmed, close the PR without merging and delete the branch.

---

## Done when
- [ ] `ci.yml` triggers on push to main and on PRs
- [ ] Typecheck, lint, and test all pass on the scaffolded project
- [ ] SonarCloud workflow confirmed correct
- [ ] Both status checks added as required gates in branch protection

## Next
→ `014-google-oauth-setup.md`