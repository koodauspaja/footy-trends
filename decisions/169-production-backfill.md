# 169 — A one-shot production backfill: decisions

Chore #169 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/db/index.ts` at `dc74e3e` by #531.

- **`closeDatabase`.** The connection lives for the server's process, but a
  script that does not close it hangs on exit with the connection still open,
  and `process.exit` in its place can truncate output that has not been
  flushed.

## Moved from comments, 2026-10-07

Cut from `scripts/backfill.ts` at `5b180e0` by #531.

- **`backfill.ts` imports nothing that touches the database.** `src/db`
  makes its client from `process.env.DATABASE_URL` the first time it is
  used, so the target has to be settled before anything that could use it is
  loaded; the work is in `backfill-run.ts`, imported dynamically. The flags
  are `-- --reset=<database-name>` and `-- --refetch`. The `.env` value is
  ignored because the script exists to write to production, and picking up a
  local default when the operator forgot to pass one is the failure worth
  designing out.
- **A blank `DATABASE_URL`.** `DATABASE_URL= npm run backfill` otherwise
  passes a null check and then fails deep inside the Postgres client, where
  the message says nothing about the variable the operator forgot to fill
  in.
- **A connection string with no database name.** Postgres would default the
  database to the username and the script would sit waiting on a
  connection, and `--reset` could never be confirmed against a name that is
  not there. Better to say so before anything connects.

Cut from `scripts/backfill-plan.ts` at `5b180e0` by #531.

- **`backfill-plan.ts`.** Pure so it can be tested; `backfill.ts` does the
  talking to providers and the database.
- **`tasoSeasonsFor`.** Each competition has a different floor (Ykkösliiga
  did not exist before 2024), so asking every competition for every season
  since 2015 would spend hundreds of requests on seasons that never
  happened.
- **`authoriseReset`.** A reset empties every table in whatever database
  `DATABASE_URL` points at, which in the intended use is production. Typing
  the wrong name is the mistake it catches: a `--reset` on a shell that
  still has yesterday's `DATABASE_URL` exported.
- **`describeError`.** A backfill inserting a season at a time produces
  statements thousands of parameters long, so printing `message` buries the
  one line that says what went wrong under 20KB of `$3791, $3792, ...`.
- **`canSkip`.** Rows are proof the fetch succeeded, which "we tried" alone
  would not be, and a finished season's results do not change while the
  current one's do. Deliberately the rule `needsRefresh` applies during
  normal operation, not a second notion of "done" invented for the script.
  A season that is genuinely empty (TASO publishes nothing for NSC 2018) has
  no rows and is re-fetched: one request against the 329 a full re-run
  costs. Re-asking about an empty season is cheap, while skipping one that
  merely failed would leave a hole nothing later fills.

Cut from `scripts/backfill-run.ts` at `5b180e0` by #531.

- **`backfill-run.ts` is imported dynamically.** Importing `src/db` fixes
  the connection, so nothing in it may be loaded before `backfill.ts` has
  settled which database is the target.
- **`alreadyStoredTasoGroups`.** A season whose matches stored and whose
  groups then failed would otherwise be skipped for ever, its group data
  never retried, because the season "has rows".
- **The backfill's first round trip.** An unreachable database otherwise
  costs a full run: every competition-season is fetched, at the providers'
  pace, and then fails to store, eleven minutes and 329 requests of rate
  limit spent to discover the database was never there.
- **The reset's transaction.** Three separate deletes would leave the
  database partly emptied if the second or third failed, and the run aborts
  on that failure, turning a deliberate clean start into destroyed data with
  nothing put back.
- **Closing the connections.** A rejection from the first close would skip
  the second and escape the function, so a run that fetched everything
  would print no summary and return no exit code because a socket failed to
  close.
