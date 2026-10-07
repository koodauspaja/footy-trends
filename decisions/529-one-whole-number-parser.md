# 529 — One parser for whole numbers in URLs: decisions

Chore #529 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/provider-ids.ts` at `ef99862` by #531.

- **`parseWholeNumber`.** `Number()` alone reads `"0x10"` as 16, `"1e3"` as
  1000, `""` and `" "` as 0 and `" 7 "` as 7, so `/kotimaa/joukkue/0x10`
  showed team 16. The digits rule out a sign and a fraction;
  `isStoredInteger` rules out a value past the column, three hundred digits
  that parse to `Infinity` included. A repeated query parameter arrives as an
  array and is no number either. A caller that needs at least 1, a round or
  a page, says so itself.

## Moved from comments, 2026-10-07

Cut from `tests/unit/app/foreign/team/[id]/page.test.tsx` at `c12c30a` by #531.

- **The not-found branch of the foreign team page.** Until this change the
  malformed-id case was the only test of it; a numeric id the lookup refuses
  has its own test now.
