# 008 — SonarCloud

## Goal

Static analysis and coverage on every pull request, with a quality gate that
fails the check. The workflow and its configuration arrive with the clone.

This project: organisation `koodauspaja`, project key `koodauspaja_footy-trends`.

---

## Step 1 — Add the repository

1. https://sonarcloud.io → sign in with GitHub
2. **+** → **Analyze new project** → your organisation → the repository
3. The free plan (public repositories), and **With GitHub Actions** as the
   analysis method

## Step 2 — The token

Copy the token SonarCloud shows, and store it as the repository secret
`SONAR_TOKEN` (**Settings** → **Secrets and variables** → **Actions**).

## Step 3 — Name your project in the configuration

In `sonar-project.properties`, set `sonar.projectKey` and `sonar.organization`
to yours. They are not secrets.

## Step 4 — Verify

Open a pull request: `SonarCloud scan` runs, and waits for the quality gate, so
a failing gate fails the check.

| | File |
|---|---|
| The workflow | `.github/workflows/sonarcloud.yml` |
| What is analysed, and what is excluded from coverage and why | `sonar-project.properties` |
| The check that fails before Sonar would: a source file no test imports | `scripts/coverage-gaps.ts`, run by `npm run test:unit` |

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

---

## Done when

- [ ] The SonarCloud project exists
- [ ] `SONAR_TOKEN` is a repository secret
- [ ] `sonar-project.properties` names your project and organisation
- [ ] `SonarCloud scan` passes on a pull request

## Next

→ `004-sourcery-setup.md`
