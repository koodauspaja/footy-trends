# 371 — Admin is granted with a script, not hand-written SQL: decisions

Chore #371 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/grant-admin-plan.ts` at `5b180e0` by #531.

- **`grant-admin-plan.ts`.** The same split as `backfill-plan.ts` and its
  entry point.
- **`normaliseEmail`.** `user.email` is written by better-auth from what
  Google returns, and an operator retyping it will not match its case.
  Matching a normalised input against a raw column would report an account
  stored as `Matti@Example.fi` as nonexistent, which review caught.
- **`looksLikeEmail` is shallow.** An address that passes it and matches no
  row is reported as "no account", the same outcome and a better message.
  The point is to catch the operator who passed a flag value by mistake, so
  `--email=--role=admin` fails saying so and does not report that nobody has
  that address.
- **Named flags in `parseArgs`.** The script writes to production, and two
  bare strings in the wrong order is a mistake the shape of the command
  should not permit. Granting is the common case and the one the setup
  document is about.
- **`describeOutcome`.** The script never reports a change it did not
  confirm: the failure the hand-written SQL had, where `where email = …`
  matching nothing looked exactly like success.
- **`ambiguousAccount`.** `user.email` is `unique` on the raw text, which is
  case-sensitive, while the script matches on `lower(email)`, so both
  `Matti@Example.fi` and `matti@example.fi` can exist; verified against
  Postgres. Acting on the first would be a coin toss, and acting on all of
  them would change accounts the operator never named.
- **A repeated flag.** The script writes to production, and
  `--email=right@… --email=typo@…` silently acting on the second is the
  class of mistake it exists to remove; a wrapper script or an edited
  shell-history line is how it happens.

Cut from `scripts/grant-admin-run.ts` at `5b180e0` by #531.

- **`grant-admin-run.ts` has its own pool.** `src/db` takes its target from
  `process.env.DATABASE_URL`, and the script's whole point is that the
  operator passes the target explicitly, which makes it impossible to get
  wrong by forgetting a variable.
- **One transaction.** Three separate statements could interleave with
  another writer, since the app itself has `/yllapito`, which changes roles,
  and the script would then report a transition that did not happen, or miss
  one that did: the failure the script exists to remove.
- **Serializable.** `for update` cannot lock a row that does not exist yet.
  Row locks make the rows it found stable, but another transaction,
  better-auth creating an account as somebody signs in, can insert a new
  case variant a moment later. Under `read committed` the script would then
  grant admin to one account while a second matching one existed, and report
  success. Serializable makes Postgres detect that and abort; the script
  reports a failure, nothing is written, and running it again reads the
  world as it now is. The structural fix is a case-insensitive unique index
  on `user.email`, a schema change to the app that would have to deal with
  duplicates already stored, so it is deliberately not done here.
- **Every match is locked.** The column holds whatever Google sent, and a
  normalised input compared against a raw column reports an account stored
  as `Matti@Example.FI` as nonexistent. The unique index is on the raw text,
  so the predicate can match more than one account. An earlier version took
  `.limit(1).for("update")`, locked one row, and then updated every match,
  so a single command could change two accounts and report one.

Cut from `scripts/grant-admin.ts` at `5b180e0` by #531.

- **`grant-admin.ts`.** It imports nothing that touches the database, so
  the target is settled before anything that could connect is loaded; the
  work is in `grant-admin-run.ts`, imported dynamically. The shape of
  `scripts/backfill.ts`. The `.env` value is ignored because the script
  exists to write to production: granting admin on a laptop while believing
  it was granted in production is worse than an error message.
- **A blank `DATABASE_URL`.** `DATABASE_URL= npm run admin:role` otherwise
  passes a null check and fails deep inside the Postgres client, where the
  message says nothing about the variable the operator forgot to fill in.
