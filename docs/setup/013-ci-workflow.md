# 013 — The workflows

## Goal

GitHub Actions running the gate on every pull request, and the release gate on
`release`. The four workflows arrive with the clone, in `.github/workflows/`.

| Workflow | When | What |
|---|---|---|
| `ci.yml` | pull requests to `main`, pushes to `main` | typecheck, lint, unit tests and their shuffled run; integration tests against Postgres and Redis; the issue-checkbox check |
| `sonarcloud.yml` | the same | the SonarCloud scan (008) |
| `release.yml` | pull requests and pushes to `release` | the same suites and the end-to-end suite against a production build, then the version tag |
| `taso-key-check.yml` | daily | asks production's `/api/health?providers=1` whether TASO still answers |

---

## Step 1 — Secrets and variables

Repository → **Settings** → **Secrets and variables** → **Actions**.

| Kind | Name | For |
|---|---|---|
| Secret | `FOOTBALL_DATA_API_KEY` | `release.yml`'s end-to-end run (007) |
| Secret | `TASO_API_KEY` | the same (020) |
| Secret | `SONAR_TOKEN` | `sonarcloud.yml` (008 sets it) |
| Variable | `OWNER_USERNAME`, `COLLABORATOR_USERNAME` | who `ci.yml` and `sonarcloud.yml` run for (001 set them) |
| Variable | `FIRST_RELEASE_VERSION` | optional: the first release's version, when it should not be `v0.1.0` (`skills/release.md`) |

## Step 2 — Point the TASO check at your production

`taso-key-check.yml` names this project's production URL in `HEALTH_URL`.
Change it to yours once production exists (021).

## Step 3 — Confirm on a pull request

Open a pull request with any change. Three checks appear and pass:
`Typecheck, lint and unit tests`, `Integration tests` and `Issue checkboxes`.
011 makes them required.

A job that reports `skipped` ran for an actor who is in neither variable.

---

## Done when

- [ ] The two provider keys are repository secrets
- [ ] `ci.yml`'s three checks pass on a pull request

## Next

→ `008-sonarqube-setup.md`
