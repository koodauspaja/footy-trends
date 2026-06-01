# 015 — Database setup (Drizzle ORM)

## Goal
Add Drizzle ORM and a migration workflow so every schema change is versioned,
repeatable, and runs automatically on Railway deploy. No application features
in this step — just the plumbing every feature will build on.

---

## Why Drizzle

Drizzle schemas are TypeScript files — the same language as the rest of the
project. Claude Code reads and writes them natively without translating from a
separate DSL. This aligns with the heavily typed mandate and means schema
changes show up in normal TypeScript type checking.

---

## Step 1 — Install packages

```bash
npm install drizzle-orm postgres
npm install --save-dev drizzle-kit
```

`postgres` is the modern Node.js Postgres client Drizzle recommends. Do not
install `pg` — mixing clients causes confusion.

---

## Step 2 — Create the database client

Create file: `src/db/index.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
```

> The `!` non-null assertion is intentional here — if `DATABASE_URL` is missing
> the app should crash immediately at startup rather than failing silently later.
> Add a `// biome-ignore lint/style/noNonNullAssertion` comment if Biome flags it,
> and note why in the decisions record for the first feature that uses the DB.

---

## Step 3 — Create the schema file

Create file: `src/db/schema.ts`

```typescript
```

Leave it empty for now. Each feature spec that needs a table will add to this
file. The migration workflow below will pick up changes automatically.

---

## Step 4 — Configure Drizzle Kit

Create file: `drizzle.config.ts` in the repo root.

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

---

## Step 5 — Create the migration runner

This script runs pending migrations at deploy time.

Create file: `src/db/migrate.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle/migrations" });

await client.end();
console.log("Migrations complete");
```

---

## Step 6 — Add scripts to package.json

Add to the `scripts` section:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx src/db/migrate.ts",
"db:studio": "drizzle-kit studio",
"db:push": "drizzle-kit push"
```

Install `tsx` if not already present:

```bash
npm install --save-dev tsx
```

| Script | When to use |
|--------|-------------|
| `db:generate` | After changing `schema.ts` — creates a new migration file |
| `db:migrate` | Applies pending migrations to the database |
| `db:studio` | Opens Drizzle Studio, a local DB browser |
| `db:push` | Pushes schema directly without a migration file — local dev only, never production |

---

## Step 7 — Update the Railway start command

Migrations must run before the app starts on each deploy. In Railway:

1. Go to Railway → project → app service → **Settings** → **Deploy**
2. Set **Start command** to:
   ```
   npm run db:migrate && npm start
   ```

This ensures schema changes are applied before traffic hits the new code.

---

## Step 8 — Create the migrations folder

```bash
mkdir -p drizzle/migrations
touch drizzle/migrations/.gitkeep
git add drizzle/
git commit -m "chore: set up Drizzle ORM and migration workflow"
git push origin main
```

---

## Step 9 — Verify locally

```bash
DATABASE_URL=your_local_db_url npm run db:migrate
```

Should output `Migrations complete` with no errors. On an empty schema this is
a no-op — that is expected.

---

## Done when
- [ ] `drizzle-orm` and `postgres` installed
- [ ] `src/db/index.ts` and `src/db/schema.ts` created
- [ ] `drizzle.config.ts` committed
- [ ] `src/db/migrate.ts` committed
- [ ] Railway start command updated to run migrations before start
- [ ] `npm run db:migrate` runs cleanly locally

## Next
→ `016-redis-cache-setup.md`