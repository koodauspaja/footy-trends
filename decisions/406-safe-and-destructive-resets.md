# 406 — The safe reset is the easy one, the destructive one deliberate: decisions

Chore #406 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/services-plan.ts` at `5b180e0` by #531.

- **`COMPOSE_TEST_DATABASE_NAME`.** Stated so the reset guard can insist on
  exactly it, and not on "anything that is not something else".
- **`testResetRefusal`.** The suites' database belongs to the tooling:
  `ensureTestDatabase` creates and migrates it, every run rebuilds what it
  needs, and nobody has state in it worth keeping. `TEST_DATABASE_URL` can
  point at a shared or remote Postgres, and dropping a database there is not
  this command's business. Deriving the test URL wrongly, or setting it to
  the dev database by mistake, would otherwise let the safe command destroy
  the one thing it exists to protect. An earlier version allowed every
  database on the compose server and refused the development and system
  databases by name; a mistyped `TEST_DATABASE_URL` dropped whatever it
  named. Raised in review on #407. A fallback for a null database name read
  as prudence and was dead code, found by lcov. "Use the other command" is
  the useful answer when it is pointed at the development database.
- **`decideConfirmation`.** Treating a missing terminal as consent would
  make every scripted or agent-driven run a silent destruction of the
  developer's database, exactly the case the confirmation exists for.
- **`isAffirmative`.** `y` is what people press to get past a dialog they
  have stopped reading, and this one destroys data.

Cut from `scripts/db-reset.ts` at `5b180e0` by #531.

- **Two resets.** The suites' database belongs to the tooling:
  `ensureTestDatabase` rebuilds it at the start of the next run, nobody has
  state in it worth keeping, and dropping it takes about a second. What
  destroys your own data should be the thing you type deliberately, not the
  short command reachable by muscle memory.

Cut from `scripts/db-reset-steps.ts` at `5b180e0` by #531.

- **Consent before Docker.** Asking after the containers had been looked
  for would still be safe, but the answer would sometimes never be reached,
  and "it did not ask me" is indistinguishable from "it did not run" only
  until the volume is gone.
- **`runTestReset` rebuilds nothing.** `ensureTestDatabase` creates and
  migrates the database at the start of the next run, so rebuilding it would
  be work the thing about to use it does anyway: the difference between a
  command that takes a second and one that takes half a minute.

Cut from `scripts/services-run.ts` at `5b180e0` by #531.

- **`dropDatabase`.** `drop database` cannot run from inside the database
  being dropped. `with (force)` because the suites' database routinely has
  connections left open by a run that was interrupted, and without it the
  drop fails with "database is being accessed by other users", which is true
  and not a reason to keep a database nobody wants.
