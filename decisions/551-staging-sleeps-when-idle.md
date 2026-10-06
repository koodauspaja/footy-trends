# 551 — Staging's web service sleeps when idle: decisions

Chore #551 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `.railway/railway.ts` at `5b180e0` by #531.

- **`sleepsWhenIdle` on staging.** Staging is idle almost all the time and
  nothing depends on it staying warm, so it sleeps after a quiet spell and
  wakes on the next request. Production does not.
