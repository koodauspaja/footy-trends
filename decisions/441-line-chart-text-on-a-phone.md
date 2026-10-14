# 441 — Line chart text sized for a phone: decisions

Chore #441 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `tests/e2e/chart-axis-text.spec.ts` at `0fe724f` by #531.

- **The sizes in `chart-axis-text.spec.ts`.** The drawing is 640 units wide,
  and a phone scales the whole of it, text included, to about 0,54x. 12 units
  reached the reader at roughly 6 px, which is what the larger phone size
  fixes without narrowing the drawing. The size is the whole point of the
  change, so it is measured in a browser, for the same reason
  `dark-mode.spec.ts` measures colour there.
