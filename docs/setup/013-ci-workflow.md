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
      - uses: actions/checkout@v7

      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          check-latest: true

      - name: Install dependencies
        run: npm ci --ignore-scripts

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test
```

> **The committed workflow has moved on from this scaffold.** It now runs two
> jobs rather than one: `Typecheck, lint and unit tests`, which deliberately
> has **no** service containers, and `Integration tests`, which has Postgres
> and Redis.
>
> The split is not for speed. With the services attached to a single job, a
> unit test that reaches Postgres or Redis passes CI, and the only workflow
> that notices is SonarCloud — which has no services either and reports it as
> "SonarCloud scan failed", naming the wrong thing. Keeping the unit job free
> of services makes such a test fail where the job name says what broke. See
> issue #158, and `.github/workflows/ci.yml` for the current file.

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
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

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

- [ ] `Typecheck, lint and unit tests` appears and passes
- [ ] `Integration tests` appears and passes
- [ ] `SonarCloud scan` appears and passes
- [ ] `Sourcery review` appears and passes
- [ ] All four are visible as status checks on the PR

Once confirmed, close the PR without merging and delete the branch.

---

## Done when
- [ ] `ci.yml` triggers on push to main and on PRs
- [ ] Typecheck, lint, and test all pass on the scaffolded project
- [ ] SonarCloud workflow confirmed correct
- [ ] Both status checks added as required gates in branch protection

## Next
→ `014-google-oauth-setup.md`