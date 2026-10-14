# 227 — The e2e suite runs serially, locally too: decisions

Chore #227 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `playwright.config.ts` at `5b180e0` by #531.

- **`workers: 1`.** A flag is the kind of thing that gets dropped when
  somebody copies the command. Parallel runs fail as regressions that are
  not real. It was CI-only, and the local half was measured failing three
  times in one day on unrelated changes, once losing five specs across four
  files on a change that touched a single Markdown file. The correct
  response each time was "ignore it and re-run serially", the reflex that
  lets a real regression through. It also matters to the pre-push hook,
  which writes its freshness marker only when a full run passes: a spurious
  parallel failure leaves no marker, so the next push is blocked and the
  hook looks broken. The cost is roughly 30s per run; see
  `tests/e2e/README.md`.
