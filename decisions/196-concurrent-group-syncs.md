# 196 — Concurrent group syncs on a cold table: decisions

Bug #196 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso-standings-service.ts` at `a86c1cb` by #531.

- **The upsert in `synchronizeGroupTeams`.** The race is reachable only on a
  cold database, which is a first deploy: the moment the page has no stored
  rows to fall back to, so the caller's catch renders an empty table.
