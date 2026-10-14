# 525 — Next is started directly, so a replaced deployment shuts down cleanly: decisions

Chore #525 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `.railway/railway.ts` at `5b180e0` by #531.

- **`startCommand`.** On the image's dash, requests in flight were cut off
  and npm reported a failure, which listed every replaced deployment as
  CRASHED. Started directly, Next closes the server and finishes pending
  requests first.
