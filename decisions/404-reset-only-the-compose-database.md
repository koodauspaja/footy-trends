# 404 — A reset refuses a database that is not the one compose creates: decisions

Bug #404 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/services-plan.ts` at `5b180e0` by #531.

- **`isComposeDatabase`.** `runsOnComposeServer` answers "would starting the
  compose containers help?", which is true of every database on that server,
  `footy-trends_test` included. This answers "is it safe to destroy this and
  correct to migrate it?". Without it `db:reset` accepted `…:5432/postgres`,
  `…:5432/footy-trends_test` and anything else on the server, destroyed the
  compose volume, then migrated whichever database the URL named and
  reported the reset a success. Reported in review on #402 and dismissed
  there, because the reply answered a question about which server this is.
- **`COMPOSE_DATABASE_NAME`.** A second copy of the compose file's value,
  kept honest by the mechanism `COMPOSE_POSTGRES_PORT` has.
- **`databaseNameOf` decodes.** `…/footy%2Dtrends` addresses a database
  called `footy-trends`, and comparing the raw path would call that a
  different one. The reasoning of `databaseNameFor` in
  `tests/support/test-database.ts`.

Cut from `scripts/db-reset-steps.ts` at `5b180e0` by #531.

- **The notice after the volume is gone.** Everything after it can fail
  (the containers may not come back, Postgres may not answer, the migrations
  may not apply), and the data is already gone in every one of those cases.
  A notice that only printed on success would be missing from exactly the
  runs where it mattered most. Raised in review on #405. It describes the
  server because `TEST_DATABASE_URL` can point the suites somewhere else, so
  claiming that a particular test database was destroyed would be a guess;
  what is certainly true is that everything in the volume has gone.
