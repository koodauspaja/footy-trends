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
