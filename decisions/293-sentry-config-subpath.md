# 293 — withSentryConfig from its new subpath: decisions

Chore #293 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `next.config.ts` at `5b180e0` by #531.

- **The `withSentryConfig` import.** The root export is deprecated as of
  10.73.0, and printed a warning on every build.
