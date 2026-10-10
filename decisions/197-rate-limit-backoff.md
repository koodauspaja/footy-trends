# 197 — A rate limit is waited out: decisions

Bug #197 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/provider-request.ts` at `ef7eb13` by #531.

- **`backoffSecondsFrom`.** football-data.org does not send `Retry-After`. It
  sends `X-RequestCounter-Reset`, the seconds until its per-minute counter
  clears, so that is read as well: falling back to a guess would either retry
  too early and fail again, or wait longer than the provider needs.
- **The retry on 429 in `fetchProviderJson`.** Without it a refusal becomes a
  thrown error, the caller falls back to stored data, and on a cold database
  there is none, so the page tells the reader the standings could not be
  loaded when the truth is only "not yet". Retrying a 404 or a 403 would
  delay a real answer without changing it.
