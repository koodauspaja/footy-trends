# 492 — A shoot-out is not part of the score: decisions

Bug #492 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`SHOOTOUT_STORED` and the aggregates that use it.** The stored score is the
  provider's `fullTime`, which includes a penalty shoot-out: Liverpool "1–5"
  PSG (Champions League, 2024/25) was 0–1 with penalties 1–4. A shoot-out is
  neither goals nor the result, so it is subtracted where stored. TASO's
  score never includes one.
