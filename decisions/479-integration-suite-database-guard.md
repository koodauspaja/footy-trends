# 479 — The integration suite refuses a database that is not a test one: decisions

Chore #479 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/test-database-name.ts` at `ef99862` by #531.

- **`test-database-name.ts`.** It imports nothing, like `e2e-analytics.ts`,
  which reads it: Playwright and the Vitest config both load it without a
  server around them.
- **`integrationDatabaseRefusal`.** `npm run test:integration` goes through
  `scripts/with-test-db.ts`, which sets `DATABASE_URL` to the test database;
  running Vitest on the suite directly leaves `.env`'s development
  `DATABASE_URL` in place, which is how the suite once wrote fixture rows
  into a developer's own database. `TEST_DATABASE_URL` is the documented
  override "where the derivation is wrong", and such a database need not end
  in `_test`. Naming it explicitly is a decision and not the accident this
  guards against.
