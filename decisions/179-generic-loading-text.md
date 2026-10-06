# 179 — The loading state names no table: decisions

Chore #179 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/app/loading.tsx` at `48ebab4` by #531.

- **The loading text.** It read `Ladataan sarjataulukkoa...`, "loading the
  standings table", which is true of three routes and false of the rest: the
  match lists, the team pages, both national-team pages and every region
  picker render no table at all. A reader on `/maajoukkueet/helmarit` was
  told the app was fetching something that page never shows. Per-route
  loading files would allow a more specific message, but the text is on
  screen for a few hundred milliseconds and three of them would carry the
  same string; accuracy is worth more than specificity here.
