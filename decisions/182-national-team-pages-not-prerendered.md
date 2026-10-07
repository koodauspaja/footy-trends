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

## Moved from comments, 2026-10-07

Cut from `tests/unit/app/rendering-mode.test.ts` at `c12c30a` by #531.

- **Why the guard is a list of static pages.** An earlier version asked
  "does this page import a data module?" and skipped anything that did not
  match a filename whitelist, so a new page importing a differently named
  module would pass unexamined: the failure direction that costs a
  production outage.
- **`takesRequestProps` reads the signature.** The previous version matched
  `searchParams` anywhere in the file, and a page's own comment mentioning
  the word was enough to make the guard skip it.
- **Only two exports opt out.** Accepting any `revalidate` would let the
  original bug straight through.
- **The class, not the one file.** Helmarit is the same shape, paramless and
  data-backed.
