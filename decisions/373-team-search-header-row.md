# 373 — The team search has its own header row: decisions

Chore #373 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/team-search.tsx` at `ef7eb13` by #531.

- **The search row's padding.** A wrapper in the header would leave an empty
  strip where the search would be, so the header would visibly change for
  someone who cannot use the search. Owning the padding makes that
  impossible and not merely unlikely. The component is used in one place, so
  there is no other layout for this to be wrong in.

Cut from `src/components/site-header.tsx` at `dc74e3e` by #531.

- **The header's two rows.** The search sat between the breadcrumb and the
  account control and has its own row below: an account control belongs in a
  corner, and swapping the two within the first row would only have moved the
  wrapping problem onto the search. With no wrapper around `TeamSearch` there
  is no empty strip left behind for a signed-out reader, whose header is what
  it was apart from the sign-in control moving to the corner.
