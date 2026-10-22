# 517 — The knockout simulations' cost inside Railway: decisions

The measurements `decisions/067-knockout-simulation.md` left as "To be measured"
for staging's web container, and the last criterion of #517. That record stays
as it was; its two Railway rows are these. Nothing in the code changes.

**Inside Railway**, the same bundled benchmark of `src/lib/knockout-simulation.ts`
that gave 067's laptop figures, the same tables, 10 000 runs, nine times each,
run by Miikka in staging's web container on 2026-10-22 (Node 24.21.0, staging
on `583eae5`):

| Where | Champions League, 99 fixtures left | The league phase over | A Suomen Cup from its round of 16 |
|---|---|---|---|
| Laptop, Node 24.16.0 (decisions/067) | 147 ms median, 167 ms slowest | 89 ms, 91 ms | 54 ms, 69 ms |
| Railway, staging's web container | 159 ms median, 170 ms slowest | 111 ms, 121 ms | 29 ms, 43 ms |

The Champions League is 1.1 to 1.25 times the laptop's time, not the twice that
decisions/061 found for the league simulation. The cup ran in about half the
laptop's time; that was measured, not explained. A miss holds the server for at
most about a sixth of a second, and the entry it writes lasts 15 minutes, so
specs/067's S6 stands: computed on a page view and cached. Requests that miss
together each compute: `getCachedUnlessDegraded` in `src/lib/cache.ts` does not
share a computation that is already running.
