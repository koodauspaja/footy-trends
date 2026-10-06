# 169 — A one-shot production backfill: decisions

Chore #169 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/db/index.ts` at `dc74e3e` by #531.

- **`closeDatabase`.** The connection lives for the server's process, but a
  script that does not close it hangs on exit with the connection still open,
  and `process.exit` in its place can truncate output that has not been
  flushed.
