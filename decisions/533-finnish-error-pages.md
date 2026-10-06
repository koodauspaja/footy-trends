# 533 — The not-found and error pages are in Finnish: decisions

Bug #533 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/app/global-error.tsx` at `48ebab4` by #531.

- **`GlobalError`.** No layout, no stylesheet, no component of the app's own:
  whatever failed may be one of them. Next's default error page is in English
  under `lang="en"`. A full page load is the point of the plain link, since
  the router that would handle a client navigation belongs to what just
  failed.

Cut from `src/app/not-found.tsx` at `48ebab4` by #531.

- **The not-found page.** Next's own default is in English. One wording for
  every case: the admin area answers a reader it does not know with
  `notFound()`, so that the page is indistinguishable from one that does not
  exist.
