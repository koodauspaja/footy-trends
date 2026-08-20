# 008 — Show winless teams in the standings table: implementation decisions

Spec: `specs/008-winless-teams-in-standings.md`
Issue: #111

## `calculateStandings` gains an optional `rosterMatches` parameter

`calculateStandings(matches, rosterMatches = matches)` seeds a zero-stats entry for every team in `rosterMatches` (home or away, any status) before accumulating stats from `matches` (still finished-only). Defaulting `rosterMatches` to `matches` keeps the single-argument call shape working exactly as before for any caller that only cares about finished-match stats — `getStandings` is the only production caller and always passes both.

`RosterMatch` (`homeTeamProviderId`/`homeTeamName`/`awayTeamProviderId`/`awayTeamName`) is a separate, smaller type from `NormalizedMatch`, since a roster entry doesn't need scores or a status — `NormalizedProviderMatch` (from `football-data.ts`) already satisfies it structurally, so `standings-service.ts` passes `seasonMatches` straight through with no mapping step.

## `getStandings` passes the full synced match list as the roster, unfiltered by round

`calculateStandings(filterByRound(toFinishedMatches(seasonMatches), round), seasonMatches)` — the roster argument is `seasonMatches` itself, not round-filtered. Per the spec's confirmed design decision, every team appears at every round (including round 1, before anyone's played), only their accumulated stats change per round. This also means the `"empty"` result now fires exactly when `seasonMatches` itself is empty (no matches of any status synced for the season) — unchanged in effect from before, since a finished-only roster was always a subset of the full match list.

## Extracted `getOrCreateTeam`, replacing the four duplicated `?? createTeam(...)` call sites

The roster-seeding loop and the stats-accumulation loop both need "look up this team, or create and register it" for home and away — four call sites doing the same thing. Extracted into `getOrCreateTeam(teams, id, name)`, which both loops call. Also dropped the two `teams.set(home.teamProviderId, home)` / `teams.set(away.teamProviderId, away)` lines at the end of the accumulation loop — they were already redundant before this change, since `home`/`away` are the same object references already in the map; mutating them doesn't need a re-set.

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 258 unit tests passing (6 new: 3 in `standings.test.ts` for roster seeding, alphabetical tie-break among winless teams, and the unchanged single-argument default; 2 in `standings-service.test.ts` for a scheduled-only team's zero-stats row and its presence in a round-filtered view; 1 in `standings/page.test.tsx` for the rendered zero-stats row and empty "Vire" cell), 100% statement/branch/function/line coverage.
- Integration tests (`tests/integration/standings.test.ts`) were not run locally — no PostgreSQL/Redis available in this environment — but call `calculateStandings` with a single argument only, so they exercise the unchanged default-parameter path; CI provisions the service containers to run them for real.
- No e2e test added: this feature only changes what data renders into the existing standings table (an extra row, zero values, an empty form cell) — no new interaction or navigation to click through, unlike spec 007.
