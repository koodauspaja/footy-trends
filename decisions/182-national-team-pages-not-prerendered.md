# 182 — The national team pages are never prerendered: decisions

Bug #182 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/app/national-teams/mens-team/page.tsx` at `48ebab4` by #531.

- **`dynamic` on the men's team page.** Every other data-backed page reads
  `searchParams`, which makes it dynamic on its own. This one has no season
  selector. Railway's private network does not exist at build time:
  `*.railway.internal` is runtime-only, so the build container cannot
  resolve the database at all. The prerender failed every bucket and baked
  the error page into the static output, which was then served to every
  visitor regardless of runtime health. `/api/health` reported the database
  as fine throughout, because it is dynamic and was fine.

Cut from `src/app/national-teams/womens-team/page.tsx` at `48ebab4` by #531.

- **`dynamic` on the women's team page.** Every other data-backed page reads
  `searchParams`, which makes it dynamic on its own. This one has no season
  selector. Railway's private network does not exist at build time:
  `*.railway.internal` is runtime-only, so the build container cannot
  resolve the database at all. The prerender failed every bucket and baked
  the error page into the static output, which was then served to every
  visitor regardless of runtime health. `/api/health` reported the database
  as fine throughout, because it is dynamic and was fine.
