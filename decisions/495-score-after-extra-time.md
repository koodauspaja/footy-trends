# 495 — Analytics read the score after extra time: decisions

Bug #495 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/standings.ts` at `ef7eb13` by #531.

- **`withoutShootout`.** football-data stores the provider's `fullTime`,
  which includes a penalty shoot-out: Liverpool "1–5" PSG (Champions League,
  2024/25) was 0–1 with penalties 1–4. A shoot-out is neither goals nor the
  result, so every analytic reading finished matches gets the score without
  it, at the one place they all pass through. The stored value itself stays
  `fullTime` (see `football-data.ts`), and the match list and the bracket
  read the breakdown on their own. A TASO row has no shoot-out columns. Half
  a shoot-out is not one, as `formatScore` asks.
