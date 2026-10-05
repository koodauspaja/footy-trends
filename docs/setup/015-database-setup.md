# 015 — The database, locally

## Goal

Know how the schema changes. The local Postgres is started by `./scripts/setup`
(012); Railway's is created in 005.

---

## Step 1 — Change the schema through a named migration

```bash
npm run db:generate -- --name=add_match_status_column
npm run db:migrate
```

`db:generate` refuses to run without `--name`, and the name is `<verb>_<what>`.
`INSTALL.md` (Database workflows) has the verbs and the other database scripts;
`CLAUDE.md` has the two rules about migrations.

| | File |
|---|---|
| The schema | `src/db/schema.ts` |
| Migrations | `drizzle/` |
| The client, and the runner a deploy uses | `src/db/index.ts`, `src/db/migrate.ts` |
| Local Postgres and Redis | `docker-compose.yml` |

The suites use their own database, `<name>_test`, created for them
(`tests/integration/README.md`).

---

## Done when

- [ ] `npm run db:migrate` completes on a fresh local database

## Next

→ `005-railway-setup.md`
