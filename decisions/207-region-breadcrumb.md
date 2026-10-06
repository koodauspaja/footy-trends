# 207 — A region breadcrumb in the site header: decisions

Chore #207 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/site-header.tsx` at `dc74e3e` by #531.

- **`SiteHeader` is a client component.** The root layout renders it, and
  the App Router exposes no server-side pathname; `usePathname()` is the
  supported way to know where we are. The alternative was a `layout.tsx` per
  region passing its own name down, which stays on the server but is five
  files and quietly loses the header for any future region that forgets one.
  On `/` and on the region pickers the second crumb would point at the page
  already shown.

Cut from `src/lib/breadcrumb.ts` at `ef99862` by #531.

- **`breadcrumb.ts`.** Kept apart from `SiteHeader` so the path-to-region
  mapping is unit-testable without rendering, and so the component stays a
  few lines of markup.
- **`regionCrumbFor`.** A crumb on a region's own picker page would link to
  the page already being shown.
