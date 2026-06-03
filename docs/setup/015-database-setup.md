# 015 — Database setup (Drizzle ORM)

## Goal
Add Drizzle ORM and a migration workflow so every schema change is versioned,
repeatable, and runs automatically on Railway deploy. Also sets up a local
Postgres instance via Docker for development.

---

## Why Drizzle

Drizzle schemas are TypeScript files — the same language as the rest of the
project. Claude Code reads and writes them natively without translating from a
separate DSL. This aligns with the heavily typed mandate and means schema
changes show up in normal TypeScript type checking.

---

## Step 1 — Set up local Postgres with Docker

Create `docker-compose.yml` in the repo root:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: footy-trends
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

Start the database:

```bash
docker compose up -d
```

Update your local `.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/footy-trends
```

---

## Step 2 — Install packages

```bash
npm install drizzle-orm postgres
npm install --save-dev drizzle-kit tsx
```

`postgres` is the modern Node.js Postgres client Drizzle recommends. Do not
install `pg` — mixing clients causes confusion.

---

## Step 3 — Create the database client

Create file: `src/db/index.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// biome-ignore lint/style/noNonNullAssertion: app must not start without DATABASE_URL
const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
```

---

## Step 4 — Create the schema file

Create file: `src/db/schema.ts`

```typescript
// Schema is empty until the first feature is implemented.
// Each feature spec that needs a table will add to this file.
```

---

## Step 5 — Configure Drizzle Kit

Create file: `drizzle.config.ts` in the repo root.

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: required at build time
    url: process.env.DATABASE_URL!,
  },
});
```

---

## Step 6 — Create the migration runner

This script runs pending migrations at deploy time.

Create file: `src/db/migrate.ts`

```typescript
import { access } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// biome-ignore lint/style/noNonNullAssertion: required for migrations
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);
const migrationJournalPath = "./drizzle/migrations/meta/_journal.json";

async function runMigrations() {
  try {
    try {
      await access(migrationJournalPath);
    } catch {
      // No generated migrations yet; skip cleanly.
      return;
    }

    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  } finally {
    await client.end();
  }
}

void runMigrations();
```

---

## Step 7 — Add scripts to package.json

Add to the `scripts` section:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx src/db/migrate.ts",
"db:studio": "drizzle-kit studio",
"db:push": "drizzle-kit push"
```

| Script | When to use |
|--------|-------------|
| `db:generate` | After changing `schema.ts` — creates a new migration file |
| `db:migrate` | Applies pending migrations to the database |
| `db:studio` | Opens Drizzle Studio, a local DB browser |
| `db:push` | Pushes schema directly without a migration file — local dev only, never production |

---

## Step 8 — Create the migrations folder and commit

```bash
mkdir -p drizzle/migrations
touch drizzle/migrations/.gitkeep
git add drizzle/ src/db/ drizzle.config.ts package.json package-lock.json docker-compose.yml
git commit -m "chore: set up Drizzle ORM and migration workflow"
git push origin main
```

---

## Step 9 — Verify locally

```bash
npm run db:migrate
```

Should output `Migrations complete` with no errors. On an empty schema this is
a no-op with no error output — that is expected.

---

## Done when
- [ ] Docker Compose running local Postgres on port 5432
- [ ] `DATABASE_URL` set in local `.env`
- [ ] `drizzle-orm`, `postgres`, `drizzle-kit`, and `tsx` installed
- [ ] `src/db/index.ts`, `src/db/schema.ts`, and `src/db/migrate.ts` created
- [ ] `drizzle.config.ts` committed
- [ ] `npm run db:migrate` runs cleanly locally

## Next
→ `016-redis-cache-setup.md`