# 113 — The scraped TASO key is monitored: decisions

Chore #113 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/app/api/health/route.ts` at `ef7eb13` by #531.

- **The TASO check's `null`.** A stale key is blocked by Cloudflare with a
  403, which throws, but an error body parses fine and yields no recognisable
  seasons. Awaiting `getCurrentSeason` without looking reported the provider
  healthy on a response that contained no data at all. Either way there is
  nothing usable behind the key, which is what the probe is being asked
  about.

## Moved from comments, 2026-10-07

Cut from `tests/unit/app/api/health/route.test.ts` at `c12c30a` by #531.

- **The provider check looks at what came back.** Awaiting
  `getCurrentSeason` without looking is the failure a scheduled check would
  have slept through.
