# 008 — Show winless teams in the standings table with zero stats

## Summary
Early in a new season, a team with zero finished matches doesn't appear in `/sarjataulukko` at all; it should show up with every stat at zero, alongside teams that have played, as long as it has at least one match (finished or scheduled) synced for the season.

## Scope

### In scope
- `calculateStandings` (`src/lib/standings.ts`) seeds a zero-stats row for every team that appears (home or away) in the season's full synced match list, not just its finished matches. Stats (played/won/drawn/lost/goals/points/form) are still accumulated from finished matches only.
- `getStandings` (`src/lib/standings-service.ts`) passes the full synced season match list (all statuses) alongside the finished-only list, so `calculateStandings` can build the roster from the former and stats from the latter.
- Round-filtered standings (`round` param, spec 003) show the same full roster at every round, including round 1 before any match has been played — only the accumulated stats change per round, not which teams appear.
- A team's roster membership comes from having at least one stored match row for the season, regardless of that match's status (`FINISHED`, `SCHEDULED`, `TIMED`, `POSTPONED`, etc.) — no status allowlist.

### Out of scope
- Any change to `calculateStandings`'s existing tie-break order (points desc, goal difference desc, goals scored desc, team name asc). Winless teams tie on the first three, so they already sort alphabetically against each other under the existing rule — nothing new to implement here.
- Any change to the `"empty"` standings-result state (spec 001/005). It still fires only when the season's full synced match list is empty (no matches of any status at all) — a genuinely different case from "some teams have played, others haven't," which this spec covers.
- Fetching or displaying a team roster independent of matches (e.g. a dedicated teams endpoint). This app has no such source — see `getTeamMatches`'s existing comment in `standings-service.ts` — and none is needed: the season's full match list (already fetched for the "upcoming matches" list per spec 005) is sufficient.
- Any UI/copy change. The existing table renders a zero-stats row and an empty "Vire" (form) cell with no new strings needed.

## UX / UI (Finnish strings)
None. No new strings; a winless team's row uses the existing column labels and renders 0 in every numeric column and nothing in "Vire" (an empty form array already renders as no `<span>`s, matching how a team with zero results in its five-match window would render today).

## API & Data
No new endpoints. `getSeasonMatches` (already called by `getSyncedSeasonMatches`) already returns every match for the season regardless of status — this spec uses that existing full list as the roster source instead of fetching anything new. No caching-policy change: standings are still cached under `standings:{competitionCode}:{seasonId}` with the existing 15-minute TTL, for the whole-season (`round === undefined`) case only, unchanged from spec 001/003.

## Edge Cases
- A team with only scheduled (unplayed) matches this season: appears with `played: 0` and every other stat at 0.
- A team whose only synced match has an unusual status (`POSTPONED`, `SUSPENDED`, `CANCELLED`): still appears with a zero-stats row, since roster membership doesn't check status.
- Round-filtered standings (`?kierros=N`) before any team has played (e.g. `kierros=1` requested before round 1 kicks off): every team appears with `played: 0`, same as the whole-season view.
- The season has zero synced matches of any status: unchanged `"empty"` result, same as today.
- Two winless teams: both show `played: 0` and sort alphabetically by team name, per the existing tie-break order — no new comparator logic.
- A team appears in the match list only as, e.g., a `CANCELLED` fixture with no rescheduled replacement: still shows a zero-stats row for the season; this spec does not attempt to detect or hide teams that effectively won't play again.

## Performance & Limits
None. The full season match list is already fetched and held in memory by `getSyncedSeasonMatches` for every `getStandings` call; this spec adds no new provider calls, database queries, or cache entries — only changes which subset of already-fetched matches seeds the team roster.

## Security & Secrets
None — no new env vars, no secrets involved.

## Acceptance Criteria
- [ ] `/sarjataulukko` shows a row for a team with zero finished matches this season but at least one scheduled match, with `played`, `won`, `drawn`, `lost`, `goalsFor`, `goalsAgainst`, `goalDifference`, and `points` all `0`, and an empty "Vire" cell.
- [ ] That row sorts alphabetically by team name among other winless teams, and below any team with points > 0.
- [ ] Selecting a round (`?kierros=N`) still shows every team in the roster, including ones with `played: 0` for that round.
- [ ] A season with zero synced matches of any status still returns the `"empty"` result — unchanged from today.
- [ ] A team whose only match this season is `POSTPONED`/`SUSPENDED`/`CANCELLED` still appears with a zero-stats row.
- [ ] Existing acceptance criteria from specs 001, 003, 005, 006 continue to pass unmodified (a team with finished matches is unaffected by this change).

## Tests Required
- `tests/unit/lib/standings.test.ts`: `calculateStandings` given a finished-match list plus a separate full-roster match list produces a zero-stats row for a team with no finished matches; confirms it sorts alphabetically against another winless team and below any team with points.
- `tests/unit/lib/standings-service.test.ts`: `getStandings` returns a winless team's zero-stats row when the synced season match list contains a scheduled-but-not-finished match for it; confirms the round-filtered path (`round` set) still includes winless teams; confirms an all-empty synced match list still returns `"empty"`.
- `tests/unit/app/standings/page.test.tsx`: renders a `0`-value row and empty "Vire" cell for a winless team returned by a mocked `getStandings`.

## Open Questions
None — the two open design questions the issue raised (round-filtered roster behavior, and which match statuses count toward roster membership) were resolved in chat before writing this spec; see Scope above.

## Files To Update
- `specs/008-winless-teams-in-standings.md` (this file)
- `src/lib/standings.ts`
- `src/lib/standings-service.ts`
- `tests/unit/lib/standings.test.ts`
- `tests/unit/lib/standings-service.test.ts`
- `tests/unit/app/standings/page.test.tsx`
- `decisions/008-winless-teams-in-standings.md` (written during implementation)
