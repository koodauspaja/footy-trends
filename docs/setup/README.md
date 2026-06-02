# Setup guides

One-time setup tasks to get the project infrastructure running.
Complete them in order — each doc ends with a **Next** pointer to the following step.

| # | File | What it does |
|---|------|-------------|
| 001 | [001-github-repo-setup.md](001-github-repo-setup.md) | Create the GitHub repo, folder structure, collaborator access, and fork PR protection |
| 002 | [002-github-project-board.md](002-github-project-board.md) | Set up the GitHub Project board and issue templates |
| 003 | [003-pr-template.md](003-pr-template.md) | Add the PR template and the `skills/open-pr.md` agent instruction |
| 004 | [004-sourcery-setup.md](004-sourcery-setup.md) | Install Sourcery, configure Finnish reviews, and add project review rules |
| 005 | [005-railway-setup.md](005-railway-setup.md) | Create Railway project, connect GitHub repo, provision PostgreSQL |
| 006 | [006-railway-verify.md](006-railway-verify.md) | Verify auto-deploy and confirm database persistence |
| 007 | [007-football-data-api.md](007-football-data-api.md) | Register for football-data.org API key and store it in Railway |
| 008 | [008-sonarqube-setup.md](008-sonarqube-setup.md) | Connect SonarQube Cloud for static analysis on every PR |
| 009 | [009-axiom-logs.md](009-axiom-logs.md) | Axiom account, dataset, and credentials for log shipping |
| 010 | [010-renovate-setup.md](010-renovate-setup.md) | Install Renovate for automated dependency update PRs |
| 012 | [012-project-init.md](012-project-init.md) | Scaffold Next.js, strict TypeScript config, and Biome |
| 013 | [013-ci-workflow.md](013-ci-workflow.md) | GitHub Actions CI — typecheck, lint, and test on every PR |
| 014 | [014-google-oauth-setup.md](014-google-oauth-setup.md) | Google Cloud project and OAuth credentials for sign-in |
| 015 | [015-database-setup.md](015-database-setup.md) | Drizzle ORM, schema setup, and Railway migration workflow |
| 016 | [016-redis-cache-setup.md](016-redis-cache-setup.md) | Redis on Railway and cache utility for API responses |
| 017 | [017-sentry-setup.md](017-sentry-setup.md) | Sentry error monitoring for runtime exceptions |
| 018 | [018-health-check.md](018-health-check.md) | Health check endpoint wired into Railway deploy |
| 019 | [019-railway-config.md](019-railway-config.md) | Railway config as code via railway.toml |
| 011 | [011-branch-protection.md](011-branch-protection.md) | Protect main branch and enforce status checks before merge |

## After setup

Once all nineteen steps are done, start with the first feature spec:
`specs/001-standings-form-table.md`
