# 536 — A missing DATABASE_URL fails by name: decisions

Chore #536 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/db/index.ts` at `dc74e3e` by #531.

- **`connected`.** `next build` imports every route, and `DATABASE_URL` may
  not be there to read at build time; a check at import would fail the build,
  and no check at all let postgres.js fall back to `localhost` or `PGHOST`
  (see `connection-string.ts`). The first query is the first moment the
  variable is needed.
- **`db` as a proxy.** Drizzle's methods read their own state from `this`,
  so a prototype method is bound. Nothing else is: a function the client
  holds as its own property, as `$client` is, carries properties a bound
  copy would lose, and so does the constructor, which drizzle recognises its
  own objects by. The prototype is the real one's too.

Cut from `src/db/connection-string.ts` at `48ebab4` by #531.

- **`connection-string.ts`.** Handed nothing, postgres.js connects by its
  own defaults: `localhost`, or whatever `PGHOST` and the other `PG*`
  variables happen to hold. The app then starts and every query fails as an
  error page; a migration is worse, because a stray `PGHOST` in someone's
  shell decides which database it changes. So an unset or empty variable is
  refused by name, before any client exists to fall back with.
  `DATABASE_URL=` in an `.env` copied from the example is the usual way to
  have neither. The message is for whoever reads the deploy log or the
  server's error log, so it is English, as logs are; a page whose query
  fails shows its own Finnish error state.

Cut from `src/db/migrate.ts` at `48ebab4` by #531.

- **`connectionString` in the migrator.** Handed nothing, postgres.js would
  migrate `localhost` or whatever `PGHOST` names. One line and a non-zero
  exit, where an uncaught error would bury the variable's name under a stack
  trace in the deploy log.
