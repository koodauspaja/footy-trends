# 302 — A privacy policy, and a footer to reach it: decisions

Chore #302 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/site-footer.tsx` at `ef99862` by #531.

- **`SiteFooter`.** Google requires a publicly reachable privacy policy
  before an OAuth consent screen can leave Testing, and a page nothing links
  to is reachable only by someone who already knows the URL. A server
  component costs the pages it sits on nothing:
  `tests/unit/app/rendering-mode.test.ts` keeps four of them prerendered, and
  a client component in the layout would have taken that away.
