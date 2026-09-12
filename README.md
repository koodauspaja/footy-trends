# Footy Trends

Footy Trends is a Next.js app for football trend analysis (Champions League and
top 5 leagues) with a production-oriented setup: strict TypeScript, Drizzle,
Postgres, Redis cache, CI, Sentry, and Railway config as code.

---

## Quick Start

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
npm run dev
```

App runs at: http://localhost:3000

If you are starting a feature, write a spec in `specs/NNN-feature-name.md` first, confirm the checklist in chat, then update the issue and **ask whether it is good** — work starts only once a human moves the card to `Ready` or tells you to start.

---

## Project Overview

### Current Capabilities

- Next.js App Router baseline with strict TypeScript
- Database access via Drizzle + Postgres
- Redis cache utilities
- Health endpoint at `/api/health` (database + redis checks)
- Error monitoring via Sentry
- Structured backend logging with Pino (Axiom transport when configured)
- CI workflows for typecheck, lint, tests, and SonarCloud scan

---

## Getting Started

### Prerequisites

- Node.js 24+
- npm 12.0.1
- Docker (for local Postgres)
- Local `.env` file based on `.env.example`

### Environment Variables

Defined in `.env.example`.

Key variables:

- `DATABASE_URL` - Postgres connection string
- `REDIS_URL` - Redis connection string
- `FOOTBALL_DATA_API_KEY` - football-data.org API key
- `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` - local match freshness threshold (default `3600`)
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry client DSN
- `AXIOM_TOKEN` and `AXIOM_DATASET` - Axiom log ingest
- `LOG_LEVEL` - Pino log level (`info`, `debug`, etc.)

---

## Architecture

### High-Level Overview

- Frontend and backend: Next.js App Router
- API layer: route handlers in `src/app/api`
- Database: PostgreSQL with Drizzle ORM
- Cache: Redis (`ioredis`)
- Observability: Sentry + Pino with optional Axiom transport
- Deployment: Railway with `railway.toml`

### Key Directories

- `src/app` - pages, layouts, and route handlers
- `src/app/api` - API endpoints
- `src/db` - database client, schema, migrations runner
- `src/lib` - shared utilities (cache, redis, logger)
- `docs/setup` - step-by-step infrastructure setup docs

### Competitions and standings

The home page (`/`) is a competition picker; each competition's standings
live at `/sarjataulukko?kilpailu={code}`. `src/lib/competitions.ts` lists
the supported competitions — currently the 9 plain league-table
competitions our football-data.org plan grants access to (Premier League
and 8 others; cup/knockout competitions and other providers are out of
scope, see `specs/006-other-competitions.md`).

Standings resolve server-side per competition and season. The app reads
calculated standings from Redis first, then normalized finished matches
from PostgreSQL, and refreshes from football-data.org when local data is
missing or older than `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS`. Provider
responses use separate Redis TTLs, keyed per competition: one hour for
competition metadata and 15 minutes for finished matches. The provider API
key is never sent to the browser.

---

## Development

### Run Checks

```bash
npm run typecheck
npm run lint
npm test
```

### Test Layout

Tests are organized by test type, with unit tests mirroring the relevant
`src/` paths:

- `tests/unit/` - isolated unit tests, run with `npm run test:unit`
- `tests/integration/` - tests spanning multiple application boundaries, run
   with `npm run test:integration`
- `tests/e2e/` - Playwright end-to-end tests against a real running
   application, run with `npm run test:e2e` (see `tests/e2e/README.md` for
   prerequisites)

CI runs the unit test suite with coverage and the integration suite, the
latter against Postgres/Redis service containers it provisions itself. The
end-to-end suite has a separate command so it can be enabled with its
required runtime setup without changing the CI workflow.

### Database Workflows

```bash
npm run db:generate -- --name=descriptive_migration_name
npm run db:migrate
```

Always pass `--name` — without it, `drizzle-kit` invents a whimsical
filename that says nothing about what changed.

Alternative for local-only schema sync:

```bash
npm run db:push
```

### Railway Deploy Config

`railway.toml` controls:

- pre-deploy migration command
- start command
- health check path and timeout
- restart policy
- deploy watch patterns

### Human Contributor Workflow

For day-to-day development, follow this sequence:

```mermaid
flowchart TD
  Human_spec["Human initiates spec in specs/NNN-feature-name.md; AI may draft"]
  Spec_checklist["Use skills/write-spec.md to verify required sections"]
  Spec_confirmed{"Open questions answered and the human said GO?"}
  AI_issue["AI updates the GitHub issue with scope and acceptance criteria (skills/open-issue.md)"]
  AI_asks["AI asks: is the issue good?"]
  Human_ready{"Authorised? Card moved to Ready by a human, OR the human said start — either alone"}
  AI_branch["If the card is not already Ready, AI moves it there quoting the authorisation; then In Progress; then branches"]
  AI_implement["AI implements feature within spec (skills/implement-feature.md)"]
  AI_decision["AI writes/updates decision record in decisions/NNN-feature-name.md"]
  AI_checks["AI runs tests, lint, typecheck, skills/self-review.md"]
  AI_open_pr["AI opens PR, ticks the issue boxes, moves the card to In Review (skills/open-pr.md)"]
  Human_merge["Human checks the result and merges, or tells the AI to merge"]
  Ask_for_info["Stop and ask for missing or unclear spec details"]
  Wait["Wait. No branch, no code, no migration, no board change"]

  Human_spec --> Spec_checklist --> Spec_confirmed
  Spec_confirmed -->|Yes| AI_issue --> AI_asks --> Human_ready
  Spec_confirmed -->|No| Ask_for_info --> Human_spec
  Human_ready -->|Yes| AI_branch --> AI_implement --> AI_decision --> AI_checks --> AI_open_pr --> Human_merge
  Human_ready -->|"Not yet"| Wait --> Human_ready
```

1. Write or update a feature spec in `specs/NNN-feature-name.md` before coding.
2. Use `skills/write-spec.md` to check that the spec covers the required sections.
3. Confirm the spec checklist in chat. Answer the open questions, then say
   **go** — the AI must not treat interest, questions or silence as a go.
4. The AI updates the GitHub issue, then **asks whether the issue is good**.
   Decide whether to read it, then authorise the start. **Either of these alone
   is enough:** move the card to `Ready` yourself, or say so in any wording —
   "looks good, update issue and start work" and "issue in ready now" both do
   it. Nothing is branched or written before that, and if the AI moves the card
   to `Ready` itself it must quote the sentence it is acting on.
5. From there the AI proceeds autonomously: branch, implement, write the
   decision record, run the checks, and prepare the PR.
6. Review the AI-written decision record in `decisions/NNN-feature-name.md`
   while the work is in progress.
7. Add or update tests, then run `npm run typecheck`, `npm run lint`, and
   `npm test`.
8. Let the AI open a PR using `skills/open-pr.md`, reference the spec and
   decisions file, link the issue, and prepare it for review.
9. Respond to review feedback, make any required changes, and only merge after
   the branch is approved.

### What the AI should do

When working with this repository, the AI assistant should:

- follow the spec-first workflow and stop if the spec is incomplete
- use the repository rules in `CLAUDE.md`, `skills/write-spec.md`,
  `skills/open-issue.md`, `skills/implement-feature.md`, and
  `skills/open-pr.md`
- help draft or refine specs, decision records, tests, and PR descriptions
- implement the feature autonomously within the bounds of the approved spec
- carry out routine workflow steps without repeated handholding **once work has
  been authorised** — branching, testing, and PR preparation
- never move a card to `Ready` and never merge a pull request **on its own
  initiative** — either is fine when a human instructs it, in any wording; those
  are the two points where a human decides
- verify changes with the relevant checks before suggesting completion
- keep user-facing UI strings in Finnish and other repo text in English

### What humans should do

Humans remain responsible for:

- deciding the product direction and acceptance criteria
- validating that the spec is complete enough for implementation
- reviewing the AI-written plan and decision record
- approving the final implementation and merge decision in GitHub
- reviewing PRs and responding to feedback
- handling repository access, branch protection, and release choices

---

## Repository Guidelines

- Use branch names that describe intent (example: `chore/npm-ci-and-logging`)
- Keep commits focused and imperative (example: `chore: pin npm in CI`)
- Keep infrastructure setup docs in `docs/setup` as source of truth

---

## Continuous Integration

GitHub Actions workflows in `.github/workflows`:

- `ci.yml`: typecheck, lint, unit test, integration test
- `sonarcloud.yml`: test with coverage + SonarCloud scan

Both workflows target Node 24, and the project expects npm 12.0.1.

---

## Documentation

- Setup sequence: `docs/setup/README.md`
- Key setup topics include database, Redis, Sentry, Axiom, CI, and Railway

---

## Notes

- This repository is still in foundational setup mode; many feature specs live
	in `specs/` and are not implemented yet.
