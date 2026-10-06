# 530 — One builder for the team panels: decisions

Chore #530 had no record of its own; #531 created this one for a reason cut from
a comment of its code.

## Moved from comments, 2026-10-05

Cut from `src/lib/standings-service.ts` at `55a14fc` by #531.

- **`getTeamPanelMatches`.** Every finished match counts, as in the table's
  `Vire`; the team id is for the log line.
