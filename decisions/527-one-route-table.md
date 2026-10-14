# 527 — Every English folder path redirects to its Finnish URL: decisions

Bug #527 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `next.config.ts` at `5b180e0` by #531.

- **`ROUTES` is read twice.** A rewrite does not block its own target:
  without the redirect the page answers on two addresses. The two lists were
  kept by hand, and eight pages had the rewrite alone. Both are made from
  the table, so a page cannot have one without the other, and
  `tests/unit/next-config.test.ts` fails if a rewrite appears that did not
  come from it. The split between Finnish URLs and English folders is
  CLAUDE.md's.
- **The national teams' match routes in `ROUTES`.** 317 ids already exist
  in both match tables.

Cut from `tests/unit/next-config.test.ts` at `e4b182f` by #531.

- **The eight in `next-config.test.ts`.** The seven folders of the issue,
  and `/predictions`, added while the issue was open.
