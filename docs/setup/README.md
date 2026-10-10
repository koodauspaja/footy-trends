# Setup guides

Standing the infrastructure up **from zero**, for someone who has cloned the
repository into their own organisation. The code arrives with the clone; these
steps create what the code runs on: accounts, apps, secrets, environments and
rules.

- **How the system is set up now**, and its constraints, is a different
  document: [`docs/infrastructure.md`](../infrastructure.md). Read that one to
  decide something; read these to build it.
- **Running the app on your machine** is [`INSTALL.md`](../../INSTALL.md).
- **Names such as `koodauspaja`, `footy-trends` and the board's IDs are this
  project's own.** Substitute yours wherever a step shows them.

## The order

Follow the table from top to bottom; each document ends with a **Next**
pointer to the one below it. **The numbers are names, not the order**: other
documents cite them, so they stay as they are.

| Step | File | What it does |
|---|---|---|
| 1 | [001-github-repo-setup.md](001-github-repo-setup.md) | Your copy of the repository, and who may run its workflows |
| 2 | [002-github-project-board.md](002-github-project-board.md) | The project board, the labels and the Issue Types |
| 3 | [003-pr-template.md](003-pr-template.md) | Confirm the pull request template; where the working agreements live |
| 4 | [012-project-init.md](012-project-init.md) | The application running locally |
| 5 | [015-database-setup.md](015-database-setup.md) | How the schema changes: named migrations |
| 6 | [005-railway-setup.md](005-railway-setup.md) | The Railway project, its `staging` environment, the web service and Postgres |
| 7 | [016-redis-cache-setup.md](016-redis-cache-setup.md) | Redis, in the web service's region |
| 8 | [007-football-data-api.md](007-football-data-api.md) | The football-data.org key |
| 9 | [020-taso-api-key.md](020-taso-api-key.md) | The TASO key, scraped, and what to do when it stops working |
| 10 | [014-google-oauth-setup.md](014-google-oauth-setup.md) | Google sign-in: a project per publishing status, and who may sign in |
| 11 | [009-axiom-logs.md](009-axiom-logs.md) | Logs to Axiom |
| 12 | [017-sentry-setup.md](017-sentry-setup.md) | Errors to Sentry |
| 13 | [025-railway-infrastructure-as-code.md](025-railway-infrastructure-as-code.md) | Apply `.railway/railway.ts`: the web service's build and deploy settings |
| 14 | [006-railway-verify.md](006-railway-verify.md) | Verify that staging deploys and keeps its data |
| 15 | [018-health-check.md](018-health-check.md) | Verify the health check |
| 16 | [013-ci-workflow.md](013-ci-workflow.md) | The workflows' secrets and variables |
| 17 | [008-sonarqube-setup.md](008-sonarqube-setup.md) | SonarCloud |
| 18 | [004-sourcery-setup.md](004-sourcery-setup.md) | Sourcery and its review rules |
| 19 | [010-renovate-setup.md](010-renovate-setup.md) | Renovate |
| 20 | [011-branch-protection.md](011-branch-protection.md) | The `main` ruleset, and the `release` ruleset step 21 creates |
| 21 | [021-production-environment.md](021-production-environment.md) | The `release` branch and the production environment |
| 22 | [022-production-backfill.md](022-production-backfill.md) | Fill production with the competitions' history, once |
| 23 | [023-admin-access.md](023-admin-access.md) | The first admin, once per environment |
| 24 | [024-predictions-cron.md](024-predictions-cron.md) | The hourly predictions cron, production only, and the backtest |
| 25 | [026-railway-environment-from-code.md](026-railway-environment-from-code.md) | Another environment from one command: its databases, the web service and its keys |

`019` described `railway.toml`, which Railway stops reading on 2026-12-01; step
13 replaced it (#521).

## Keeping these true

These change rarely: when a new developer would meet something these steps do
not cover. A change to the running system is recorded in
`docs/infrastructure.md`, in the same pull request.
