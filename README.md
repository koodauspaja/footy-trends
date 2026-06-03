# Footy Trends

Footy Trends is a Next.js app for football trend analysis (Champions League and
top 5 leagues) with a production-oriented setup: strict TypeScript, Drizzle,
Postgres, Redis cache, CI, Sentry, and Railway config as code.

---

## Quick Start

```bash
npm install
docker compose up -d
npm run db:migrate
npm run dev
```

App runs at: http://localhost:3000

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
- npm 11.16.0
- Docker (for local Postgres)
- Local `.env` file based on `.env.example`

### Environment Variables

Defined in `.env.example`.

Key variables:

- `DATABASE_URL` - Postgres connection string
- `REDIS_URL` - Redis connection string
- `FOOTBALL_DATA_API_KEY` - football-data.org API key
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

---

## Development

### Run Checks

```bash
npm run typecheck
npm run lint
npm test
```

### Database Workflows

```bash
npm run db:generate
npm run db:migrate
```

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

---

## Repository Guidelines

- Use branch names that describe intent (example: `chore/npm-ci-and-logging`)
- Keep commits focused and imperative (example: `chore: pin npm in CI`)
- Keep infrastructure setup docs in `docs/setup` as source of truth

---

## Continuous Integration

GitHub Actions workflows in `.github/workflows`:

- `ci.yml`: typecheck, lint, test
- `sonarcloud.yml`: test with coverage + SonarCloud scan

Both workflows pin Node 24 and npm 11.16.0.

---

## Documentation

- Setup sequence: `docs/setup/README.md`
- Key setup topics include database, Redis, Sentry, Axiom, CI, and Railway

---

## Notes

- This repository is still in foundational setup mode; many feature specs live
	in `specs/` and are not implemented yet.
