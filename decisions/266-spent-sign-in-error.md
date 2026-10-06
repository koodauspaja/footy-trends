# 266 — A spent sign-in error does not survive the next attempt: decisions

Bug #266 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/auth-controls.tsx` at `a86c1cb` by #531.

- **`report` in `AuthButtons`.** A rejected sign-out leaves the reader looking
  at a header that says they are signed in while the session row and cookie
  still exist, and an unhandled rejection is all the trace it would leave.
- **`clearError`.** Sign-out succeeds without navigating, so a notice left
  over from a failed one would stay on screen. The ordinary path adds no
  history entry.

Cut from `src/lib/return-path.ts` at `ef99862` by #531.

- **`returnPath` drops `error`.** Carrying the whole query string is what
  returns the reader to `?kilpailu=`, `?kausi=` or `?vaihe=` where they left
  off, but on `/?error=auth` it also made `callbackURL` point at the error
  itself, so a successful sign-in landed the reader back on
  `Kirjautuminen epäonnistui`, telling them the thing that had just worked
  had failed. An error belongs to one attempt, not to the page.
