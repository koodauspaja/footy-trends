# 170 — The tab title follows the selected season: decisions

Bug #170 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `tests/e2e/title-metadata.spec.ts` at `0fe724f` by #531.

- **What `title-metadata.spec.ts` pins.** The reported symptom, a title
  stuck on the previous season until a reload, did not reproduce on Next
  16.3.2 in nine measurements across the dev server, a production build and
  production itself, warm and cold, including at 400ms RTT. What exists is a
  7–17ms window in which the title is briefly blank while the streamed
  metadata catches up with the body, which is imperceptible. So the specs
  are not a failing-then-fixed regression test; there was no fix to make.
  They pin the behaviour that was measured.
