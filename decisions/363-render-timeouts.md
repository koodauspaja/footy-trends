# 363 — A page render's provider requests are bounded: decisions

Bug #363 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso.ts` at `a86c1cb` by #531.

- **`RENDER_TIMEOUT_MS`.** Unbounded before this, which is how the v1.4.0
  release e2e run failed 41 specs: TASO accepted the connection and stalled,
  and only Playwright's own 30 s applied. The same commit passed twenty minutes
  later. Measured then: 47-67 ms across six fresh connections, and once 19.9 s
  for a response whose own `result_time` said 0.061 s.
- **Ten seconds, chosen for margin and not derived from a measurement.** Five
  was tried first and failed four national-team specs against a cold cache,
  twice. The explanation first written beside it blamed the page's fan-out;
  measuring refuted that: 18-20 requests, 12-14 of them concurrent, 0.52 MB in
  total, a per-request worst case of 80-512 ms. Re-run later, five seconds
  passed all nineteen. Those runs caught TASO being slow for an afternoon, not
  a property of this code.
- **Separate from football-data's bound,** so tuning one does not move the
  other. It bounds one attempt; the health probe's signal bounds the whole
  call, and the two stack.
- **Set in `request`, not at each call site.** Every TASO request goes through
  it, so one value covers the ones page renders make without threading a
  signal through four exported functions.

Cut from `src/lib/football-data.ts` at `a86c1cb` by #531.

- **`RENDER_TIMEOUT_MS` in `football-data.ts`.** Unbounded before this, for
  the reason TASO was: `fetchProviderJson` took an optional signal and the
  render path never passed one. Nothing has been observed stalling here; the
  bound exists because "we have not seen it yet" is not a limit. Separate from
  TASO's on purpose: TASO is the one observed stalling, so the two should be
  tunable without moving each other. Eight seconds against TASO's ten because
  nothing here fans out the way the national-team page does. The wait after a
  429 stays governed by the response's own `Retry-After`.
