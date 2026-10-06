# 085 — The health endpoint reports the running commit: decisions

Chore #085 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/app/api/health/route.ts` at `ef7eb13` by #531.

- **`deployedCommit`.** "Which version is in production?" becomes a request
  and not dashboard archaeology. Locally and in tests there is no deployment
  behind it, and `null` is the honest answer. `?? null` alone would report
  `""` for a variable that exists but is empty, which reads as "the commit is
  the empty string" and a probe cannot tell that from "unknown". The commit
  and not a version string: the tag is derived from it
  (`git tag --points-at`), so the two cannot drift the way a hand-maintained
  version would. See `skills/release.md`.
