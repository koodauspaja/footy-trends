# 489 — Links repeated per data row are not prefetched: decisions

Chore #489 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/row-link.tsx` at `48ebab4` by #531.

- **`RowLink`.** In a production build `<Link>` prefetches every link that
  scrolls into view. Each prefetch is small, since the root `loading.tsx`
  stops it at the shell, but it still renders the shared layout, which reads
  the database, and a list page has dozens of such links. Measured on a
  production build: a standings page made 45 prefetches and doubled its
  database work per view (40 transactions against 19 with prefetching
  blocked), for pages a reader mostly never opens. Navigation (the header,
  the footer, breadcrumbs, the competition picker, single links to another
  page) keeps Next's default, where prefetching earns its cost.
